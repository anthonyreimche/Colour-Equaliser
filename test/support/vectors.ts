// The reference vectors generated from Ansel's own code by
// test/reference/build.cjs, typed for the suites.

import raw from "../reference/vectors.json";

export type Triple = [number, number, number];

export interface RefParams {
  /** [ring 0..2][channel 0 saturation, 1 brightness, 2 hue][node] as [x, y]. */
  curves: [number, number][][][];
  whiteLevel: number;
  sigmaL: number;
  sigmaRho: number;
  sigmaTheta: number;
  neutralProtection: number;
  interpolation: 0 | 1 | 2;
}

export interface Vectors {
  spline: { nodes: [number, number][]; samples: [number, number][] }[];
  hsb: { hsb: Triple; xyz: Triple; lutRgb: Triple; previewSrgb: Triple; displaySrgb: Triple }[];
  referenceSaturation: Triple;
  axisRgb: Triple;
  params: RefParams[];
  /** [set][192][L, rho, theta, deltaL, chromaScale, deltaTheta]. */
  anchors: number[][][];
  field: { points: Triple[]; out: Triple[] }[];
  /** Set A at level 16, absolute values, index (b·16 + g)·16 + r. */
  lut16: number[];
  apply: { level: 16; inputs: Triple[]; tetrahedral: Triple[]; trilinear: Triple[]; pyramid: Triple[] };
  pixels: { set: number; level: 32; whiteLevel: number; interpolation: 0 | 1 | 2; in: Triple[]; out: Triple[] }[];
}

export const V: Vectors = raw as unknown as Vectors;

/** |a − b| ≤ tol on every component. */
export function closeTo(actual: readonly number[], expected: readonly number[], tol: number): boolean {
  return actual.length === expected.length && actual.every((v, i) => Math.abs(v - expected[i]) <= tol);
}
