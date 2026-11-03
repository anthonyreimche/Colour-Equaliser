// The pixel model — Ansel's process(): white level, HLG Rec2020, the table,
// and back — against the reference pixels, and the identity contract at the
// defaults.

import { describe, expect, it } from "vitest";
import { CHANNELS } from "../src/curve";
import { lutLevel } from "../src/field";
import { DEFAULT_PARAMS, buildTable, defaultCurves, effectActive, equalisePixel, equaliseWith, fieldParams } from "../src/model";
import { RINGS } from "../src/rings";
import { REC2020_TO_SRGB, SRGB_TO_REC2020, apply3 } from "../src/ucs";
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

  // Ansel's table takes code values in [0, 1] and keeps the excess above 1;
  // the part below black must come back too, as it went in.
  it("passes a signed pixel through an untouched table unchanged", () => {
    const table = buildTable(DEFAULT_PARAMS, 16);
    for (const rgb of [[-0.2, 0.6, -0.1], [0.9, -0.05, 1.3], [-0.3, -0.1, 0.05], [3.5, 2.2, 1.4]] as const) {
      const out = equalisePixel(rgb, table, 16, DEFAULT_PARAMS.whiteLevel, DEFAULT_PARAMS.interpolation);
      for (let c = 0; c < 3; c++) expect(out[c]).toBeCloseTo(rgb[c], 6);
    }
  });

  it("floors a version 1 pixel's part below black in Rec2020, as those edits were made", () => {
    const table = buildTable(DEFAULT_PARAMS, 16);
    for (const rgb of [[-0.2, 0.6, -0.1], [-0.3, -0.1, 0.05], [0.4, -0.3, 0.2]] as const) {
      const r = apply3(SRGB_TO_REC2020, rgb);
      const floored = apply3(REC2020_TO_SRGB, [Math.max(r[0], 0), Math.max(r[1], 0), Math.max(r[2], 0)]);
      const out = equalisePixel(rgb, table, 16, DEFAULT_PARAMS.whiteLevel, DEFAULT_PARAMS.interpolation, 1);
      for (let c = 0; c < 3; c++) expect(out[c]).toBeCloseTo(floored[c], 6);
      expect(floored.some((v, c) => Math.abs(v - rgb[c]) > 1e-3)).toBe(true);
    }
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
