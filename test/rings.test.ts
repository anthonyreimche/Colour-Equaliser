// The three brightness rings against Ansel's numbers: the reference
// saturation each ring is drawn and edited at, the grey each ring sits on in
// the table's code values, the cube-shell projection, and the sparse anchors
// _build_clut derives from the curves.

import { describe, expect, it } from "vitest";
import { projectToCubeShell } from "../src/cube";
import {
  HUE_SAMPLES,
  REFERENCE_SATURATION,
  RINGS,
  RING_BRIGHTNESS,
  allAnchors,
  axisAnchors,
  axisRgb,
  ringAnchors,
} from "../src/rings";
import { curvesFromReference } from "./support/reference-params";
import { V, closeTo } from "./support/vectors";

describe("ring constants", () => {
  it("places the rings at Ansel's brightnesses", () => {
    expect(RINGS).toEqual(["shadows", "midtones", "highlights"]);
    expect(RING_BRIGHTNESS).toEqual({ shadows: 0.15, midtones: 0.45, highlights: 0.75 });
    expect(HUE_SAMPLES).toBe(64);
  });

  it("finds the same reference saturations as the C bisection", () => {
    RINGS.forEach((ring, i) => expect(Math.abs(REFERENCE_SATURATION[ring] - V.referenceSaturation[i])).toBeLessThan(1e-5));
  });

  it("sits each ring on the same grey code value", () => {
    RINGS.forEach((ring, i) => expect(Math.abs(axisRgb(RING_BRIGHTNESS[ring]) - V.axisRgb[i])).toBeLessThan(1e-5));
  });
});

describe("projectToCubeShell", () => {
  it("pulls an outside colour onto the cube face along the ray from the axis", () => {
    expect(closeTo(projectToCubeShell([0.5, 0.5, 0.5], [1.5, 0.5, 0.5]), [1, 0.5, 0.5], 1e-12)).toBe(true);
    expect(closeTo(projectToCubeShell([0.5, 0.5, 0.5], [0.6, 0.5, 0.5]), [0.6, 0.5, 0.5], 1e-12)).toBe(true);
    expect(closeTo(projectToCubeShell([0.2, 0.2, 0.2], [0.2, 0.2, 0.2]), [0.2, 0.2, 0.2], 1e-12)).toBe(true);
    expect(closeTo(projectToCubeShell([0.5, 0.5, 0.5], [-0.5, 1.5, 0.5]), [0, 1, 0.5], 1e-12)).toBe(true);
  });
});

describe("ringAnchors", () => {
  it("matches _build_clut's anchors for every parameter set", () => {
    V.params.forEach((ref, set) => {
      const anchors = ringAnchors(curvesFromReference(ref));
      expect(anchors.length).toBe(192);
      anchors.forEach((a, i) => {
        const [L, rho, theta, deltaL, chromaScale, deltaTheta] = V.anchors[set][i];
        expect(Math.abs(a.L - L)).toBeLessThan(2e-5);
        expect(Math.abs(a.rho - rho)).toBeLessThan(2e-5);
        let dTheta = Math.abs(a.theta - theta);
        if (dTheta > Math.PI) dTheta = 2 * Math.PI - dTheta;
        expect(dTheta).toBeLessThan(2e-5);
        expect(Math.abs(a.deltaL - deltaL)).toBeLessThan(2e-5);
        expect(Math.abs(a.chromaScale - chromaScale)).toBeLessThan(2e-5);
        expect(Math.abs(a.deltaTheta - deltaTheta)).toBeLessThan(2e-5);
        expect(a.weight).toBe(1);
      });
    });
  });

  it("leaves a flat ring with exactly no displacement", () => {
    const anchors = ringAnchors(curvesFromReference(V.params[2])).slice(0, 64);
    for (const a of anchors) {
      expect(a.deltaL).toBe(0);
      expect(a.chromaScale).toBe(1);
      expect(a.deltaTheta).toBe(0);
    }
  });

  it("adds the achromatic ring at a 1/64 weight", () => {
    const axis = axisAnchors();
    expect(axis.length).toBe(64);
    expect(axis[63].L).toBeCloseTo(Math.sqrt(3), 12);
    expect(axis[0]).toMatchObject({ L: 0, rho: 0, theta: 0, deltaL: 0, chromaScale: 1, deltaTheta: 0, weight: 1 / 64 });
    expect(allAnchors(curvesFromReference(V.params[0])).length).toBe(256);
  });
});
