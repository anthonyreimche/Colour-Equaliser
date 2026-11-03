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
//  • a small frame takes the smaller level the same way;
//  • a mask's copy of the stage builds its own table from the mask's curves
//    and applies it inside the mask, leaving every pixel outside it as the
//    photo's own curves left it.
//
// The timings it prints are SwiftShader (CPU) numbers, only useful relative
// to each other.

import { describe, expect, it } from "vitest";
import { lutLevel } from "@ceq/field";
import { DEFAULT_PARAMS, defaultCurves, equaliseWith, type Params } from "@ceq/model";
import { deriveAll } from "@ceq/params";
import { allStages } from "@ceq/stage";
import { REC2020_TO_SRGB, SRGB_TO_REC2020, apply3, hsvToRgb } from "@ceq/ucs";
import { paramsFromReference } from "@ceq-test/support/reference-params";
import { V } from "@ceq-test/support/vectors";
import {
  LINEAR_PROBE_PIPELINE,
  OPEN_PROBE,
  type Frame,
  builtinStages,
  floatImage,
  identityParams,
  withRenderer,
} from "@/rendering/webgl/webgl.test-support";
import { CURRENT_PROCESS_VERSION, defaultMaskAdjustments, type Mask } from "@/catalog/types";
import type { ProcessingStageContribution } from "@/extensions/types";

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

/** Channels past white and colours outside sRGB, with strongly negative
 *  channels, by quarter, and a grey ramp. */
function wideScene(w: number, h: number): Float64Array {
  const wide = new Float64Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const v = y / (h - 1);
      const rgb =
        y < h / 4
          ? [0.5 + 3.5 * u, 0.3 + 2.2 * u, 0.2 + 1.4 * u]
          : y < h / 2
            ? [0.2 + 1.2 * u, -0.05 - 0.45 * v, 0.1 + 0.9 * u]
            : y < (3 * h) / 4
              ? [-0.2 - 0.3 * u, 0.4 + 0.8 * v, -0.1 - 0.4 * v]
              : [0.05 + 0.8 * u, 0.05 + 0.8 * u, 0.05 + 0.8 * u];
      wide.set(rgb, (y * w + x) * 3);
    }
  }
  return wide;
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

/** The GPU's change against Ansel's, over the columns `inside` picks (all by default). */
function compare(
  on: Frame,
  off: Frame,
  ref: { input: Float64Array; output: Float64Array },
  w: number,
  inside = (_x: number) => true,
): Comparison {
  let n = 0;
  let se = 0;
  let change = 0;
  let count = 0;
  let clipped = 0;
  let max = 0;
  let outliers = 0;
  let worst = "";
  for (let p = 0; p < on.width * on.height; p++) {
    if (!inside(p % w)) continue;
    n++;
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

// A linear gradient whose step sits at u = 0.5: the right half is covered.
const RIGHT_HALF: Mask["components"][number] = {
  id: "right",
  kind: "linear",
  mode: "add",
  invert: false,
  linear: { x0: 0.5, y0: 0, x1: 0.5001, y1: 0 },
};

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

  // On process version 2 nothing upstream clips, so the stage sees channels
  // past white and below zero. The scene capture is `lin` as the display
  // transform receives it, signed. A stage at the same phase and priority that
  // floors `lin` at zero is the positive control: it must change the capture,
  // or the scene doesn't reach the stage signed and the test proves nothing.
  // A curve bent by a hair turns the stage on with a table that moves nothing.
  it("passes values outside [0, 1] through on version 2, and moves them as Ansel's table does", () => {
    const w = 96;
    const h = 64;
    const level = lutLevel(w * h);
    const wide = wideScene(w, h);
    const image = toImage(wide, w, h);
    const floorsAhead: ProcessingStageContribution = {
      id: "test.floors-ahead",
      name: "Floors ahead",
      phase: "scene-linear",
      priority: 85,
      glsl: "lin = max(lin, 0.0);",
      uniforms: [],
    };
    const scene = (stages: ProcessingStageContribution[], bags: Record<string, unknown>[]): Frame[] =>
      withRenderer({ stages: [...builtinStages(), ...stages], pipeline: OPEN_PROBE }, (r) => {
        r.setImage(image);
        r.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
        return bags.map((bag) => {
          r.setContributedParams(bag);
          r.render();
          const f = r.readFloatFrame("scene");
          if (!f) throw new Error("readFloatFrame returned null");
          return f;
        });
      });
    const [bare] = scene([], [{}]);
    const [floored] = scene([floorsAhead], [{}]);
    let moved = 0;
    for (let i = 0; i < bare.data.length; i++) if (bare.data[i] !== floored.data[i]) moved++;
    expect(moved).toBeGreaterThan(w * h * 0.1);

    const curves = defaultCurves();
    const hair: Params = {
      ...DEFAULT_PARAMS,
      curves: { ...curves, highlights: { ...curves.highlights, saturation: curves.highlights.saturation.map((n, k) => (k === 0 ? { ...n, y: 0.5001 } : n)) } },
    };
    const [off, untouched, edited] = scene(allStages(), [deriveAll(DEFAULT_PARAMS), deriveAll(hair), deriveAll(A)]);
    let worst = 0;
    let negatives = 0;
    for (let p = 0; p < w * h; p++) {
      for (let ch = 0; ch < 3; ch++) {
        const want = bare.data[p * 4 + ch];
        worst = Math.max(worst, Math.abs(untouched.data[p * 4 + ch] - want) / Math.max(1, Math.abs(want)));
        if (want < -0.01) negatives++;
      }
    }
    console.log(`[ceq-gpu] over range, curve bent by a hair: worst relative change ${worst.toExponential(2)}, ${negatives} values below zero`);
    expect(negatives).toBeGreaterThan(w * h * 0.5);
    expect(worst).toBeLessThan(1e-3);

    // The reference starts from the frame with the stage idle, which is what
    // the stage receives: at the quarters' edges the captured rows sit far from
    // the scene as written, so a reference from the source misses them.
    const apply = equaliseWith(A, level);
    const pixel = (f: Frame, p: number): [number, number, number] => [f.data[p * 4], f.data[p * 4 + 1], f.data[p * 4 + 2]];
    let se = 0;
    let change = 0;
    let kept = 0;
    let max = 0;
    let worstAt = "";
    let fromSource = 0;
    for (let p = 0; p < w * h; p++) {
      const input = pixel(off, p);
      const ref = apply(input);
      for (let ch = 0; ch < 3; ch++) {
        const got = edited.data[p * 4 + ch];
        const e = got - ref[ch];
        se += e * e;
        change += (ref[ch] - input[ch]) ** 2;
        fromSource = Math.max(fromSource, Math.abs(input[ch] - wide[p * 3 + ch]));
        if (got < -0.01) kept++;
        if (Math.abs(e) > max) {
          max = Math.abs(e);
          worstAt = `x=${p % w} y=${Math.floor(p / w)} ch=${ch} in=${input[ch].toFixed(4)} ref=${ref[ch].toFixed(4)} gpu=${got.toFixed(4)}`;
        }
      }
    }
    const rmse = Math.sqrt(se / (w * h * 3));
    const changeRms = Math.sqrt(change / (w * h * 3));
    console.log(
      `[ceq-gpu] over range, ${CASES[0][0]}: change rms ${changeRms.toExponential(2)}; error rms ${rmse.toExponential(2)} ` +
        `(${((100 * rmse) / changeRms).toFixed(2)}%), max ${max.toExponential(2)}, ${kept} values below zero, ` +
        `idle frame up to ${fromSource.toExponential(2)} from the source; worst ${worstAt}`,
    );
    expect(changeRms).toBeGreaterThan(1e-3);
    expect(kept).toBeGreaterThan(w * h * 0.5);
    expect(rmse).toBeLessThan(Math.max(changeRms * MAX_ERROR_FRACTION, MAX_ERROR_FLOOR));
  });

  // Version 1 photos keep the look they were edited with: HLG floors each
  // Rec2020 channel's part below black and nothing adds it back. The input is
  // the frame with the stage idle, what reaches the stage on version 1. The
  // control: flooring must move a tenth of the values, or the scene can't
  // tell the versions apart.
  it("floors the part below black on version 1, as those edits were made", () => {
    const w = 96;
    const h = 64;
    const level = lutLevel(w * h);
    const image = toImage(wideScene(w, h), w, h);
    const curves = defaultCurves();
    const hair: Params = {
      ...DEFAULT_PARAMS,
      curves: { ...curves, highlights: { ...curves.highlights, saturation: curves.highlights.saturation.map((n, k) => (k === 0 ? { ...n, y: 0.5001 } : n)) } },
    };
    const [off, untouched, edited] = withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: OPEN_PROBE }, (r) => {
      r.setImage(image);
      r.setParams(identityParams({ processVersion: 1 }));
      return [deriveAll(DEFAULT_PARAMS), deriveAll(hair), deriveAll(A)].map((bag) => {
        r.setContributedParams(bag);
        r.render();
        const f = r.readFloatFrame("scene");
        if (!f) throw new Error("readFloatFrame returned null");
        return f;
      });
    });
    const pixel = (f: Frame, p: number): [number, number, number] => [f.data[p * 4], f.data[p * 4 + 1], f.data[p * 4 + 2]];
    const floor = (rgb: [number, number, number]) => {
      const r = apply3(SRGB_TO_REC2020, rgb);
      return apply3(REC2020_TO_SRGB, [Math.max(r[0], 0), Math.max(r[1], 0), Math.max(r[2], 0)]);
    };
    const apply = equaliseWith(A, level, 1);
    let floored = 0;
    let worst = 0;
    let se = 0;
    let change = 0;
    for (let p = 0; p < w * h; p++) {
      const input = pixel(off, p);
      const want = floor(input);
      const ref = apply(input);
      for (let ch = 0; ch < 3; ch++) {
        if (Math.abs(want[ch] - input[ch]) > 0.01) floored++;
        worst = Math.max(worst, Math.abs(untouched.data[p * 4 + ch] - want[ch]) / Math.max(1, Math.abs(want[ch])));
        se += (edited.data[p * 4 + ch] - ref[ch]) ** 2;
        change += (ref[ch] - input[ch]) ** 2;
      }
    }
    const rmse = Math.sqrt(se / (w * h * 3));
    const changeRms = Math.sqrt(change / (w * h * 3));
    console.log(
      `[ceq-gpu] version 1: ${floored} values floored; curve bent by a hair, worst relative error ${worst.toExponential(2)}; ` +
        `${CASES[0][0]}, change rms ${changeRms.toExponential(2)}, error rms ${rmse.toExponential(2)}`,
    );
    expect(floored).toBeGreaterThan(w * h * 0.3);
    expect(worst).toBeLessThan(1e-3);
    expect(changeRms).toBeGreaterThan(1e-3);
    expect(rmse).toBeLessThan(Math.max(changeRms * MAX_ERROR_FRACTION, MAX_ERROR_FLOOR));
  });

  it("applies a mask's curves inside the mask, and the photo's everywhere else", () => {
    const [name, params] = CASES[1];
    const level = lutLevel(W * H);
    const mask: Mask = {
      id: "m",
      name: "Mask",
      visible: true,
      invert: false,
      opacity: 100,
      adj: defaultMaskAdjustments(),
      panels: ["colour-equaliser.panel"],
      bag: deriveAll(params),
      components: [RIGHT_HALF],
    };
    withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: LINEAR_PROBE_PIPELINE }, (renderer) => {
      renderer.setImage(SWEEP_IMAGE);
      renderer.setContributedParams(deriveAll(DEFAULT_PARAMS));
      renderer.setParams(identityParams({ processVersion: 2 }));
      const off = renderer.captureFloatFrame();
      renderer.setParams(identityParams({ processVersion: 2, masks: [mask] }));
      const on = renderer.captureFloatFrame();
      expect(off).not.toBeNull();
      expect(on).not.toBeNull();

      // Columns either side of the step, clear of the three its baked coverage
      // ramps over at this width (about 0.2, 0.6 and 0.98 from column 128).
      const left = (x: number) => x < W / 2 - 1;
      const right = (x: number) => x > W / 2 + 2;
      for (let p = 0; p < W * H; p++) {
        if (!left(p % W)) continue;
        for (let ch = 0; ch < 3; ch++) expect(on!.data[p * 4 + ch]).toBe(off!.data[p * 4 + ch]);
      }
      const s = compare(on!, off!, reference(SWEEP, params, level), W, right);
      console.log(
        `[ceq-gpu] masked ${name}: Ansel change rms ${s.changeRms.toExponential(2)}; ` +
          `error rms ${s.rmse.toExponential(2)} (${((100 * s.rmse) / s.changeRms).toFixed(2)}%), ` +
          `max ${s.max.toExponential(2)}, ${s.outliers} outliers, ${(100 * s.clipped).toFixed(2)}% clipped; worst ${s.worst}`,
      );
      expect(s.changeRms).toBeGreaterThan(1e-3);
      expect(s.clipped).toBeLessThan(0.1);
      expect(s.outliers).toBe(0);
      expect(s.rmse).toBeLessThan(Math.max(s.changeRms * MAX_ERROR_FRACTION, MAX_ERROR_FLOOR));
    });
  });
});
