// The module's parameters and its pixel transform — Ansel's process() with
// the table built by commit_params (iop/colorequal.c, © Aurélien Pierre,
// GPL-3.0-or-later): divide by the white level, take linear sRGB to HLG
// Rec2020 code values, look the displacement up, come back. The CPU
// reference the GPU stage is judged against, and the panel's model.

import { CHANNELS, defaultCurve, type Channel } from "./curve";
import {
  applyDisplacementTable,
  fillDisplacementTable,
  type FieldParams,
  type Interpolation,
} from "./field";
import { RINGS, allAnchors, type Curves, type Ring } from "./rings";
import { REC2020_TO_SRGB, SRGB_TO_REC2020, apply3, hlgEotf, hlgOetf, type Vec3 } from "./ucs";

export interface Params {
  curves: Curves;
  /** EV; the image is divided by 2^whiteLevel before the table. */
  whiteLevel: number;
  /** Brightness smoothing, a percentage of the diagonal. */
  sigmaL: number;
  /** Saturation smoothing, in chroma off the diagonal. */
  sigmaRho: number;
  /** Hue smoothing, radians around the diagonal. */
  sigmaTheta: number;
  neutralProtection: number;
  interpolation: Interpolation;
}

export function defaultCurves(): Curves {
  const out = {} as Record<Ring, Record<Channel, readonly import("./curve").CurveNode[]>>;
  for (const ring of RINGS) {
    out[ring] = {} as Record<Channel, readonly import("./curve").CurveNode[]>;
    for (const channel of CHANNELS) out[ring][channel] = defaultCurve();
  }
  return out;
}

export const DEFAULT_PARAMS: Params = {
  curves: defaultCurves(),
  whiteLevel: 1,
  sigmaL: 50,
  sigmaRho: 1,
  sigmaTheta: 0.4,
  neutralProtection: 0.05,
  interpolation: 0,
};

/** Something to render: some node off the flat line on some curve. */
export function effectActive(p: Params): boolean {
  for (const ring of RINGS) {
    for (const channel of CHANNELS) {
      if (p.curves[ring][channel].some((n) => n.y !== 0.5)) return true;
    }
  }
  return false;
}

/** commit_params' smoothing radii. */
export function fieldParams(p: Params): FieldParams {
  const sigmaL = Math.max(p.sigmaL * 0.01, 1e-6);
  const sigmaRho = Math.max(p.sigmaRho, 1e-6);
  const sigmaTheta = Math.max(p.sigmaTheta, 1e-6);
  return {
    invSigmaL: 1 / sigmaL,
    invSigmaRho: 1 / sigmaRho,
    invSigmaTheta: 1 / sigmaTheta,
    rho0: Math.max(p.neutralProtection, 0) * sigmaRho,
  };
}

export function buildTable(p: Params, level: number): Float32Array {
  return fillDisplacementTable(level, allAnchors(p.curves), fieldParams(p));
}

/** process() for one scene-linear sRGB pixel. */
export function equalisePixel(
  rgb: Vec3,
  table: Float32Array,
  level: number,
  whiteLevelEv: number,
  mode: Interpolation,
): Vec3 {
  const white = Math.max(Math.pow(2, whiteLevelEv), 1e-6);
  const lin = apply3(SRGB_TO_REC2020, [rgb[0] / white, rgb[1] / white, rgb[2] / white]);
  const code = applyDisplacementTable([hlgOetf(lin[0]), hlgOetf(lin[1]), hlgOetf(lin[2])], table, level, mode);
  const out = apply3(REC2020_TO_SRGB, [hlgEotf(code[0]), hlgEotf(code[1]), hlgEotf(code[2])]);
  return [out[0] * white, out[1] * white, out[2] * white];
}

/** The transform for a parameter set: the identity while nothing is edited,
 *  else the table built once and applied per pixel. */
export function equaliseWith(p: Params, level: number): (rgb: Vec3) => Vec3 {
  if (!effectActive(p)) return (rgb) => [rgb[0], rgb[1], rgb[2]];
  const table = buildTable(p, level);
  return (rgb) => equalisePixel(rgb, table, level, p.whiteLevel, p.interpolation);
}
