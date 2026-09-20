// The stage on the real renderer. Run via `npm run test:gpu` (test/gpu/run.cjs
// copies this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//
//  • the pass programs and the inline compile and link on a real GLSL ES 3.00
//    driver, with the host's uniform and helper namespacing, and the inline
//    finds the host's prepass result sampler by name;
//  • the defaults are a bit-exact no-op through the host's gate, also with
//    nodes moved along a flat curve;
//  • the table built by two draws on half-float targets, read back through
//    textureSize / texelFetch and interpolated three ways, matches Ansel's
//    process() (equalisePixel) at the level the frame affords;
//  • a small frame takes the smaller level the same way.
//
// The timings it prints are SwiftShader (CPU) numbers, only useful relative
// to each other.

import { describe, expect, it } from "vitest";
import { lutLevel } from "@ceq/field";
import { DEFAULT_PARAMS, defaultCurves, equaliseWith, type Params } from "@ceq/model";
import { deriveAll } from "@ceq/params";
import { allStages } from "@ceq/stage";
import { hsvToRgb } from "@ceq/ucs";
import { paramsFromReference } from "@ceq-test/support/reference-params";
import { V } from "@ceq-test/support/vectors";
import {
  LINEAR_PROBE_PIPELINE,
  type Frame,
  builtinStages,
  floatImage,
  identityParams,
  withRenderer,
} from "@/rendering/webgl/webgl.test-support";

// ── Scenes ───────────────────────────────────────────────────────────────────

/** Hue by column, three brightness bands by row (one per ring, roughly), a
 *  grey strip at the left. Values stay under the probe pipeline's filmic
 *  knee (luma 0.85) so its tone chain is the identity on the comparison. */
function sweepScene(w: number, h: number): Float64Array {
  const img = new Float64Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const band = Math.floor((3 * y) / h);
    const value = band === 0 ? 0.12 : band === 1 ? 0.35 : 0.6;
    for (let x = 0; x < w; x++) {
      const grey = x < w / 16;
      const [r, g, b] = grey ? [0.3, 0.3, 0.3] : hsvToRgb(x / w, 0.65, value);
      const i = (y * w + x) * 3;
      img[i] = r;
      img[i + 1] = g;
      img[i + 2] = b;
    }
  }
  return img;
}

/** float32 → binary16 → float32, round to nearest even: the source upload is
 *  RGBA16F, so this is the value the GPU actually receives. */
function f16round(v: number): number {
  if (v === 0 || !Number.isFinite(v)) return v;
  const sign = v < 0 ? -1 : 1;
  const a = Math.abs(v);
  const e = Math.floor(Math.log2(a));
  const step = Math.pow(2, Math.max(e, -14) - 10);
  const q = a / step;
  const f = Math.floor(q);
  const frac = q - f;
  const r = frac > 0.5 || (frac === 0.5 && f % 2 === 1) ? f + 1 : f;
  return sign * r * step;
}

const toImage = (src: Float64Array, w: number, h: number) =>
  floatImage(w, h, (x, y) => {
    const i = (y * w + x) * 3;
    return [src[i], src[i + 1], src[i + 2]];
  });

// ── Reference and comparison ─────────────────────────────────────────────────

/** Ansel's answer for the f16 scene at the table level the frame affords. */
function reference(src: Float64Array, p: Params, level: number): { input: Float64Array; output: Float64Array } {
  const input = src.map(f16round);
  const apply = equaliseWith(p, level);
  const output = new Float64Array(input.length);
  for (let i = 0; i < input.length; i += 3) {
    const [r, g, b] = apply([input[i], input[i + 1], input[i + 2]]);
    output[i] = r;
    output[i + 1] = g;
    output[i + 2] = b;
  }
  return { input, output };
}

interface Comparison {
  rmse: number;
  changeRms: number;
  max: number;
  clipped: number;
  outliers: number;
  worst: string;
}

// Beyond these the probe pipeline's knee and clamp make a sample incomparable.
const CLIP_LO = 0.002;
const CLIP_HI = 0.8;

function compare(on: Frame, off: Frame, ref: { input: Float64Array; output: Float64Array }, w: number): Comparison {
  const n = on.width * on.height;
  let se = 0;
  let change = 0;
  let count = 0;
  let clipped = 0;
  let max = 0;
  let outliers = 0;
  let worst = "";
  for (let p = 0; p < n; p++) {
    const out = [ref.output[p * 3], ref.output[p * 3 + 1], ref.output[p * 3 + 2]];
    if (out.some((v) => v < CLIP_LO || v > CLIP_HI)) {
      clipped++;
      continue;
    }
    for (let ch = 0; ch < 3; ch++) {
      const g = on.data[p * 4 + ch] - off.data[p * 4 + ch];
      const r = out[ch] - ref.input[p * 3 + ch];
      const e = g - r;
      se += e * e;
      change += r * r;
      count++;
      if (Math.abs(e) > 0.01) outliers++;
      if (Math.abs(e) > max) {
        max = Math.abs(e);
        worst = `x=${p % w} y=${Math.floor(p / w)} ch=${ch} in=${ref.input[p * 3 + ch].toFixed(4)} ref=${out[ch].toFixed(4)} gpu=${on.data[p * 4 + ch].toFixed(4)} off=${off.data[p * 4 + ch].toFixed(4)}`;
      }
    }
  }
  return {
    rmse: Math.sqrt(se / Math.max(1, count)),
    changeRms: Math.sqrt(change / Math.max(1, count)),
    max,
    clipped: clipped / n,
    outliers,
    worst,
  };
}

function expectBitExact(a: Frame | null, b: Frame | null): void {
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  for (let i = 0; i < a!.data.length; i++) expect(a!.data[i]).toBe(b!.data[i]);
}

const MAX_ERROR_FRACTION = 0.02;
const MAX_ERROR_FLOOR = 1e-4;

const A = paramsFromReference(V.params[0]);
const B = paramsFromReference(V.params[1]);
const C = paramsFromReference(V.params[2]);

const CASES: [string, Params][] = [
  ["A: midtone saturation boost", A],
  ["B: highlight hue shift + shadow brightness cut, trilinear", B],
  ["C: twelve-node midtone hue, two-node highlight saturation, pyramid, no neutral protection", C],
  ["A trilinear", { ...A, interpolation: 1 }],
  ["A pyramid", { ...A, interpolation: 2 }],
];

function movedFlatNodes(): Params {
  const curves = defaultCurves();
  const hue = curves.midtones.hue.map((n) => ({ x: n.x + 0.03, y: 0.5 }));
  return { ...DEFAULT_PARAMS, curves: { ...curves, midtones: { ...curves.midtones, hue } } };
}

describe("Colour Equaliser stage on the real renderer", () => {
  const W = 256;
  const H = 256;
  const SWEEP = sweepScene(W, H);
  const SWEEP_IMAGE = toImage(SWEEP, W, H);

  it("is a bit-exact no-op at the defaults, and with nodes moved along a flat curve", () => {
    // Renderers share one context and a nested one's dispose() tears down GL
    // state the outer one relies on, so the frames are taken in sequence.
    const bare = withRenderer({ stages: builtinStages(), pipeline: LINEAR_PROBE_PIPELINE }, (r) => {
      r.setImage(SWEEP_IMAGE);
      r.setParams(identityParams());
      return r.captureFloatFrame();
    });
    const idle = withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: LINEAR_PROBE_PIPELINE }, (r) => {
      r.setImage(SWEEP_IMAGE);
      r.setParams(identityParams());
      r.setContributedParams(deriveAll(DEFAULT_PARAMS));
      const off = r.captureFloatFrame();
      r.setContributedParams(deriveAll(movedFlatNodes()));
      const moved = r.captureFloatFrame();
      return { off, moved };
    });
    expectBitExact(idle.off, bare);
    expectBitExact(idle.moved, bare);
  });

  it("reproduces Ansel's process() for every parameter set and interpolation", () => {
    const level = lutLevel(W * H);
    expect(level).toBe(40);
    withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: LINEAR_PROBE_PIPELINE }, (renderer) => {
      renderer.setImage(SWEEP_IMAGE);
      renderer.setParams(identityParams());
      renderer.setContributedParams(deriveAll(DEFAULT_PARAMS));
      const off = renderer.captureFloatFrame();
      expect(off).not.toBeNull();
      expect(off!.width).toBe(W);
      expect(off!.height).toBe(H);
      for (const [name, p] of CASES) {
        renderer.setContributedParams(deriveAll(p));
        const t0 = performance.now();
        const on = renderer.captureFloatFrame();
        const ms = performance.now() - t0;
        expect(on).not.toBeNull();
        const s = compare(on!, off!, reference(SWEEP, p, level), W);
        console.log(
          `[ceq-gpu] ${name}: ${ms.toFixed(0)} ms; Ansel change rms ${s.changeRms.toExponential(2)}; ` +
            `error rms ${s.rmse.toExponential(2)} (${((100 * s.rmse) / s.changeRms).toFixed(2)}%), ` +
            `max ${s.max.toExponential(2)}, ${s.outliers} outliers, ${(100 * s.clipped).toFixed(2)}% clipped; worst ${s.worst}`,
        );
        expect(s.changeRms).toBeGreaterThan(1e-3);
        expect(s.clipped).toBeLessThan(0.1);
        expect(s.outliers).toBe(0);
        expect(s.rmse).toBeLessThan(Math.max(s.changeRms * MAX_ERROR_FRACTION, MAX_ERROR_FLOOR));
      }
    });
  });

  it("takes the smaller table level a small frame affords", () => {
    const w = 96;
    const h = 64;
    const level = lutLevel(w * h);
    expect(level).toBe(18);
    const scene = sweepScene(w, h);
    const image = toImage(scene, w, h);
    const frames = withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: LINEAR_PROBE_PIPELINE }, (renderer) => {
      renderer.setImage(image);
      renderer.setParams(identityParams());
      renderer.setContributedParams(deriveAll(DEFAULT_PARAMS));
      const off = renderer.captureFloatFrame();
      renderer.setContributedParams(deriveAll(A));
      const on = renderer.captureFloatFrame();
      return { off, on };
    });
    expect(frames.off).not.toBeNull();
    expect(frames.on).not.toBeNull();
    const s = compare(frames.on!, frames.off!, reference(scene, A, level), w);
    console.log(
      `[ceq-gpu] ${w}x${h} at level ${level}: change rms ${s.changeRms.toExponential(2)}; error rms ${s.rmse.toExponential(2)} ` +
        `(${((100 * s.rmse) / s.changeRms).toFixed(2)}%), max ${s.max.toExponential(2)}, ${s.outliers} outliers; worst ${s.worst}`,
    );
    expect(s.changeRms).toBeGreaterThan(1e-3);
    expect(s.outliers).toBe(0);
    expect(s.rmse).toBeLessThan(Math.max(s.changeRms * MAX_ERROR_FRACTION, MAX_ERROR_FLOOR));
  });
});
