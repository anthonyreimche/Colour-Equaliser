// The bridge between the panel's params and the develop param bag. The raw
// curve nodes are the edit and the GPU data at once: each curve is ten vec4
// chunks (two nodes each) plus a count, under the stage id, so nothing is
// stored twice. The scalars sit beside them; `on` is derived (some node off
// the flat line) and gates the inline, which keeps an untouched photo a
// bit-exact no-op. The host runs the stage's prepass whenever any of its keys
// is non-zero — node positions always are — so a photo that has ever been
// touched rebuilds an identity table while its curves are flat: two cheap
// draws, cached until a key changes.

import { CHANNELS, MAX_NODES, MIN_NODES, normaliseNodes, type Channel, type CurveNode } from "./curve";
import type { Interpolation } from "./field";
import { DEFAULT_PARAMS, defaultCurves, effectActive, type Params } from "./model";
import { RINGS, type Curves, type Ring } from "./rings";

export const EXT_ID = "colour-equaliser";

/** The host prefixes a stage's GLSL names with a 4-char hash of its id
 *  (shader-compiler.ts hashStageId). Mirrored to salt the id until its prefix
 *  is unique among this extension's stages, and to name the host's prepass
 *  result sampler in the inline. */
export function stagePrefix4(stageId: string): string {
  let h = 0;
  for (let i = 0; i < stageId.length; i++) h = ((h << 5) - h + stageId.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 4);
}

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  let id = base;
  for (let salt = 1; taken.has(stagePrefix4(id)) && salt < 1000; salt++) id = `${base}-${salt}`;
  return id;
}

export const STAGE_ID = uniqueId(`${EXT_ID}.rings`, new Set());

export const CHUNKS = 10;

export const CHANNEL_KEY: Readonly<Record<Channel, string>> = {
  saturation: "Saturation",
  brightness: "Brightness",
  hue: "Hue",
};

export function curveKey(ring: Ring, channel: Channel, chunk: number): string {
  return `${STAGE_ID}.${ring}${CHANNEL_KEY[channel]}${chunk}`;
}

export function countKey(ring: Ring, channel: Channel): string {
  return `${STAGE_ID}.${ring}${CHANNEL_KEY[channel]}Count`;
}

export const SCALAR = ["whiteLevel", "sigmaL", "sigmaRho", "sigmaTheta", "neutralProtection", "interpolation", "on"] as const;
export type Scalar = (typeof SCALAR)[number];

export const KEY: Readonly<Record<Scalar, string>> = Object.fromEntries(
  SCALAR.map((k) => [k, `${STAGE_ID}.${k}`]),
) as Record<Scalar, string>;

/** Every curve chunk and count key, ring-major then channel. */
export function curveKeys(): string[] {
  const out: string[] = [];
  for (const ring of RINGS) {
    for (const channel of CHANNELS) {
      for (let c = 0; c < CHUNKS; c++) out.push(curveKey(ring, channel, c));
      out.push(countKey(ring, channel));
    }
  }
  return out;
}

export type Bag = Record<string, unknown>;
export type Patch = Record<string, number | number[]>;

/** Two nodes per vec4, x then y, zero padded to CHUNKS chunks; the nodes
 *  normalised first so the shader can assume sorted x in [0, 1). */
export function packCurve(nodes: readonly CurveNode[]): { chunks: number[][]; count: number } {
  const sorted = normaliseNodes(nodes);
  const chunks: number[][] = [];
  for (let c = 0; c < CHUNKS; c++) {
    const a = sorted[2 * c];
    const b = sorted[2 * c + 1];
    chunks.push([a?.x ?? 0, a?.y ?? 0, b?.x ?? 0, b?.y ?? 0]);
  }
  return { chunks, count: sorted.length };
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isChunk = (v: unknown): v is number[] => Array.isArray(v) && v.length === 4 && v.every(finite);

/** The nodes back out of their chunks: wrapped, sorted, duplicates (within
 *  1e-6 in x) dropped. */
export function unpackCurve(chunks: readonly (readonly number[])[], count: number): CurveNode[] {
  const raw: CurveNode[] = [];
  for (let k = 0; k < count; k++) {
    const chunk = chunks[k >> 1];
    const o = (k & 1) * 2;
    raw.push({ x: chunk[o], y: chunk[o + 1] });
  }
  const sorted = normaliseNodes(raw);
  const out: CurveNode[] = [];
  for (const n of sorted) {
    if (out.length > 0 && Math.abs(n.x - out[out.length - 1].x) < 1e-6) continue;
    out.push(n);
  }
  return out;
}

function readCurve(bag: Bag, ring: Ring, channel: Channel): readonly CurveNode[] | null {
  const count = bag[countKey(ring, channel)];
  if (!finite(count) || count < MIN_NODES || count > MAX_NODES || count !== Math.floor(count)) return null;
  const chunks: number[][] = [];
  for (let c = 0; c < Math.ceil(count / 2); c++) {
    const chunk = bag[curveKey(ring, channel, c)];
    if (!isChunk(chunk)) return null;
    chunks.push(chunk);
  }
  const nodes = unpackCurve(chunks, count);
  return nodes.length >= MIN_NODES ? nodes : null;
}

function num(bag: Bag, key: string, fallback: number): number {
  const v = bag[key];
  return finite(v) ? v : fallback;
}

/** The panel's params from a bag; Ansel's defaults per curve and per scalar
 *  for anything missing or foreign. */
export function readParams(bag: Bag): Params {
  const defaults = defaultCurves();
  const curves = {} as Record<Ring, Record<Channel, readonly CurveNode[]>>;
  for (const ring of RINGS) {
    curves[ring] = {} as Record<Channel, readonly CurveNode[]>;
    for (const channel of CHANNELS) curves[ring][channel] = readCurve(bag, ring, channel) ?? defaults[ring][channel];
  }
  const interpolation = Math.round(num(bag, KEY.interpolation, DEFAULT_PARAMS.interpolation));
  return {
    curves: curves as Curves,
    whiteLevel: num(bag, KEY.whiteLevel, DEFAULT_PARAMS.whiteLevel),
    sigmaL: num(bag, KEY.sigmaL, DEFAULT_PARAMS.sigmaL),
    sigmaRho: num(bag, KEY.sigmaRho, DEFAULT_PARAMS.sigmaRho),
    sigmaTheta: num(bag, KEY.sigmaTheta, DEFAULT_PARAMS.sigmaTheta),
    neutralProtection: num(bag, KEY.neutralProtection, DEFAULT_PARAMS.neutralProtection),
    interpolation: (interpolation < 0 ? 0 : interpolation > 2 ? 2 : interpolation) as Interpolation,
  };
}

/** Everything to persist and drive the GPU for a parameter set. */
export function deriveAll(p: Params): Patch {
  const out: Patch = {};
  for (const ring of RINGS) {
    for (const channel of CHANNELS) {
      const { chunks, count } = packCurve(p.curves[ring][channel]);
      chunks.forEach((chunk, c) => {
        out[curveKey(ring, channel, c)] = chunk;
      });
      out[countKey(ring, channel)] = count;
    }
  }
  out[KEY.whiteLevel] = p.whiteLevel;
  out[KEY.sigmaL] = p.sigmaL;
  out[KEY.sigmaRho] = p.sigmaRho;
  out[KEY.sigmaTheta] = p.sigmaTheta;
  out[KEY.neutralProtection] = p.neutralProtection;
  out[KEY.interpolation] = p.interpolation;
  out[KEY.on] = effectActive(p) ? 1 : 0;
  return out;
}

export function resetPatch(): Patch {
  return deriveAll(DEFAULT_PARAMS);
}

/** A bag holding the equaliser's curves but a gate that disagrees with them
 *  (a preset that carried only some keys, an edit from another release) gets
 *  the whole patch re-derived; null when the bag has no equaliser keys or is
 *  already consistent. */
export function rederivePatch(bag: Bag): Patch | null {
  if (!curveKeys().some((k) => k in bag)) return null;
  const expected = deriveAll(readParams(bag));
  return bag[KEY.on] === expected[KEY.on] ? null : expected;
}
