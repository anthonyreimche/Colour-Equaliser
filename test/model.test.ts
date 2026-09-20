// The pixel model — Ansel's process(): white level, HLG Rec2020, the table,
// and back — against the reference pixels, and the identity contract at the
// defaults.

import { describe, expect, it } from "vitest";
import { CHANNELS } from "../src/curve";
import { lutLevel } from "../src/field";
import { DEFAULT_PARAMS, buildTable, defaultCurves, effectActive, equalisePixel, equaliseWith, fieldParams } from "../src/model";
import { RINGS } from "../src/rings";
import { paramsFromReference } from "./support/reference-params";
import { V } from "./support/vectors";

describe("defaults", () => {
  it("are Ansel's", () => {
    expect(DEFAULT_PARAMS.whiteLevel).toBe(1);
    expect(DEFAULT_PARAMS.sigmaL).toBe(50);
    expect(DEFAULT_PARAMS.sigmaRho).toBe(1);
    expect(DEFAULT_PARAMS.sigmaTheta).toBe(0.4);
    expect(DEFAULT_PARAMS.neutralProtection).toBe(0.05);
    expect(DEFAULT_PARAMS.interpolation).toBe(0);
    for (const ring of RINGS) {
      for (const channel of CHANNELS) {
        const nodes = DEFAULT_PARAMS.curves[ring][channel];
        expect(nodes.length).toBe(8);
        nodes.forEach((n, k) => expect(n).toEqual({ x: k / 8, y: 0.5 }));
      }
    }
    expect(defaultCurves()).not.toBe(DEFAULT_PARAMS.curves);
  });

  it("derive the smoothing radii as commit_params does", () => {
    const f = fieldParams({ ...DEFAULT_PARAMS, sigmaL: 30, sigmaRho: 0.6, sigmaTheta: 0.8, neutralProtection: 0.5 });
    expect(f.invSigmaL).toBeCloseTo(1 / 0.3, 12);
    expect(f.invSigmaRho).toBeCloseTo(1 / 0.6, 12);
    expect(f.invSigmaTheta).toBeCloseTo(1 / 0.8, 12);
    expect(f.rho0).toBeCloseTo(0.3, 12);
    expect(fieldParams({ ...DEFAULT_PARAMS, sigmaRho: 0, neutralProtection: -1 })).toMatchObject({ invSigmaRho: 1e6, rho0: 0 });
  });
});

describe("effectActive", () => {
  it("is off while every curve is flat, even with nodes moved along it", () => {
    expect(effectActive(DEFAULT_PARAMS)).toBe(false);
    const curves = defaultCurves();
    const moved = { ...DEFAULT_PARAMS, curves: { ...curves, midtones: { ...curves.midtones, hue: [{ x: 0.1, y: 0.5 }, { x: 0.6, y: 0.5 }] } } };
    expect(effectActive(moved)).toBe(false);
    const bent = { ...DEFAULT_PARAMS, curves: { ...curves, shadows: { ...curves.shadows, saturation: [{ x: 0, y: 0.5 }, { x: 0.5, y: 0.51 }] } } };
    expect(effectActive(bent)).toBe(true);
  });
});

describe("equalisePixel", () => {
  it("is exactly the identity at the defaults", () => {
    const apply = equaliseWith(DEFAULT_PARAMS, 16);
    for (const v of [[0.3, 0.2, 0.7], [1.4, 0.9, 0.1], [0, 0, 0]] as const) expect(apply(v)).toEqual([...v]);
  });

  it("reproduces Ansel's process() for every reference pixel", () => {
    for (const set of V.pixels) {
      const p = paramsFromReference(V.params[set.set]);
      expect(set.level).toBe(32);
      const table = buildTable(p, set.level);
      set.in.forEach((rgb, i) => {
        const out = equalisePixel(rgb, table, set.level, p.whiteLevel, p.interpolation);
        for (let c = 0; c < 3; c++) {
          expect(Math.abs(out[c] - set.out[i][c])).toBeLessThan(2e-5 + 2e-4 * Math.abs(set.out[i][c]));
        }
      });
    }
  });

  it("changes colours the reference changes", () => {
    const set = V.pixels[0];
    const moved = set.in.filter((rgb, i) => rgb.some((v, c) => Math.abs(v - set.out[i][c]) > 1e-3));
    expect(moved.length).toBeGreaterThan(5);
    expect(lutLevel(256 * 256)).toBe(40);
  });
});
