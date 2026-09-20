// The local displacement field against Ansel's dt_colorrings_eval_local_field:
// the grey-cylindrical frame, the Wendland C2 kernel, the field itself over
// the reference lattice points, and the table level that fits a prepass
// target.

import { describe, expect, it } from "vitest";
import {
  MAX_LUT_LEVEL,
  evalLocalField,
  grayAxisRgbFromL,
  grayBasisToRgb,
  lutIndex,
  lutLevel,
  rgbToGrayCyl,
  wendlandC2,
  type FieldParams,
} from "../src/field";
import { allAnchors } from "../src/rings";
import { curvesFromReference } from "./support/reference-params";
import { V, closeTo, type RefParams } from "./support/vectors";

export function fieldParamsOf(ref: RefParams): FieldParams {
  const sigmaRho = Math.max(ref.sigmaRho, 1e-6);
  return {
    invSigmaL: 1 / Math.max(ref.sigmaL * 0.01, 1e-6),
    invSigmaRho: 1 / sigmaRho,
    invSigmaTheta: 1 / Math.max(ref.sigmaTheta, 1e-6),
    rho0: Math.max(ref.neutralProtection, 0) * sigmaRho,
  };
}

describe("grey-cylindrical frame", () => {
  it("puts white on the diagonal at L = √3 with no chroma", () => {
    const c = rgbToGrayCyl([1, 1, 1]);
    expect(c.L).toBeCloseTo(Math.sqrt(3), 12);
    expect(c.rho).toBeLessThan(1e-12);
    expect(grayAxisRgbFromL(Math.sqrt(3))).toBeCloseTo(1, 12);
  });

  it("inverts through the basis", () => {
    const rgb = [0.2, 0.7, 0.4] as const;
    const c = rgbToGrayCyl(rgb);
    expect(closeTo(grayBasisToRgb(c.L, c.rho * Math.cos(c.theta), c.rho * Math.sin(c.theta)), rgb, 1e-12)).toBe(true);
  });
});

describe("wendlandC2", () => {
  it("is 1 at the centre, 0 at the edge, (1−d)⁴(4d+1) between", () => {
    expect(wendlandC2(0)).toBe(1);
    expect(wendlandC2(1)).toBe(0);
    expect(wendlandC2(1.5)).toBe(0);
    expect(wendlandC2(0.5)).toBeCloseTo(0.5 ** 4 * 3, 12);
  });
});

describe("evalLocalField", () => {
  it("matches Ansel's displacement at every reference lattice point", () => {
    V.params.forEach((ref, set) => {
      const anchors = allAnchors(curvesFromReference(ref));
      const fp = fieldParamsOf(ref);
      const { points, out } = V.field[set];
      points.forEach((p, i) => expect(closeTo(evalLocalField(p, anchors, fp), out[i], 3e-5)).toBe(true));
    });
  });

  it("moves nothing on the grey axis", () => {
    const anchors = allAnchors(curvesFromReference(V.params[0]));
    expect(evalLocalField([0.3, 0.3, 0.3], anchors, fieldParamsOf(V.params[0]))).toEqual([0, 0, 0]);
  });
});

describe("lutLevel", () => {
  it("is the largest level ≤ 64 whose cube fits the target", () => {
    expect(MAX_LUT_LEVEL).toBe(64);
    expect(lutLevel(262144)).toBe(64);
    expect(lutLevel(262143)).toBe(63);
    expect(lutLevel(4096 * 2730)).toBe(64);
    expect(lutLevel(65536)).toBe(40);
    expect(lutLevel(6144)).toBe(18);
    expect(lutLevel(8)).toBe(2);
    expect(lutLevel(1)).toBe(2);
    for (let t = 2; t < 5000; t += 7) {
      const l = lutLevel(t);
      expect(l * l * l).toBeLessThanOrEqual(Math.max(t, 8));
      expect((l + 1) ** 3 > t || l === 64).toBe(true);
    }
  });

  it("indexes the lattice red-fastest", () => {
    expect(lutIndex(0, 0, 0, 16)).toBe(0);
    expect(lutIndex(1, 0, 0, 16)).toBe(1);
    expect(lutIndex(0, 1, 0, 16)).toBe(16);
    expect(lutIndex(0, 0, 1, 16)).toBe(256);
  });
});
