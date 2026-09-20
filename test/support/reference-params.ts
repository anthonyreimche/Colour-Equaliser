// The reference harness's parameter sets in the extension's own types.

import { CHANNELS, type CurveNode } from "../../src/curve";
import type { Params } from "../../src/model";
import { RINGS, type Curves } from "../../src/rings";
import type { RefParams } from "./vectors";

export function curvesFromReference(ref: RefParams): Curves {
  const out: Record<string, Record<string, CurveNode[]>> = {};
  RINGS.forEach((ring, r) => {
    out[ring] = {};
    CHANNELS.forEach((channel, c) => {
      out[ring][channel] = ref.curves[r][c].map(([x, y]) => ({ x, y }));
    });
  });
  return out as unknown as Curves;
}

export function paramsFromReference(ref: RefParams): Params {
  return {
    curves: curvesFromReference(ref),
    whiteLevel: ref.whiteLevel,
    sigmaL: ref.sigmaL,
    sigmaRho: ref.sigmaRho,
    sigmaTheta: ref.sigmaTheta,
    neutralProtection: ref.neutralProtection,
    interpolation: ref.interpolation,
  };
}
