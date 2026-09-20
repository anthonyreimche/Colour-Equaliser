// The three brightness rings of Ansel's colour equalizer and the sparse
// anchors _build_clut derives from their curves (iop/colorequal.c,
// pixel/colorequal_shared.c, © Aurélien Pierre, GPL-3.0-or-later).
//
// A ring is a circle of dt UCS hues at a fixed brightness and at the largest
// saturation that keeps every hue inside sRGB. Each hue sample carries a
// *before* colour (the ring itself) and an *after* colour (the ring through
// the three curves); both are taken to HLG Rec2020 code values, projected
// onto the RGB cube shell around the ring's grey, and expressed in the
// grey-cylindrical frame, where the difference becomes the anchor's
// displacement.

import {
  CHANNELS,
  channelValue,
  curveXToHue,
  samplePeriodic,
  wrapHuePi,
  wrapPi,
  type Channel,
  type CurveNode,
} from "./curve";
import { projectToCubeShell, rgbToGrayCyl } from "./cube";
import { hsbToLutRgb, hsbToPreviewSrgb, type Vec3 } from "./ucs";

export type Ring = "shadows" | "midtones" | "highlights";
export const RINGS: readonly Ring[] = ["shadows", "midtones", "highlights"];
export const RING_BRIGHTNESS: Readonly<Record<Ring, number>> = { shadows: 0.15, midtones: 0.45, highlights: 0.75 };

export const HUE_SAMPLES = 64;
export const AXIS_SAMPLES = 64;
/** The achromatic ring's share of the field, per anchor. */
export const AXIS_WEIGHT = 1 / AXIS_SAMPLES;

export type Curves = Readonly<Record<Ring, Readonly<Record<Channel, readonly CurveNode[]>>>>;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** _compute_reference_saturation: 18 bisection steps for the largest dt UCS
 *  saturation whose 64 hue samples all stay inside sRGB. */
export function referenceSaturation(brightness: number): number {
  let low = 0;
  let high = 1;
  for (let iter = 0; iter < 18; iter++) {
    const candidate = 0.5 * (low + high);
    let valid = true;
    for (let hue = 0; hue < HUE_SAMPLES; hue++) {
      const rgb = hsbToPreviewSrgb([curveXToHue(hue / HUE_SAMPLES), candidate, brightness]);
      if (rgb[0] < 0 || rgb[0] > 1 || rgb[1] < 0 || rgb[1] > 1 || rgb[2] < 0 || rgb[2] > 1) {
        valid = false;
        break;
      }
    }
    if (valid) low = candidate;
    else high = candidate;
  }
  return low;
}

export const REFERENCE_SATURATION: Readonly<Record<Ring, number>> = {
  shadows: referenceSaturation(RING_BRIGHTNESS.shadows),
  midtones: referenceSaturation(RING_BRIGHTNESS.midtones),
  highlights: referenceSaturation(RING_BRIGHTNESS.highlights),
};

/** dt_colorrings_ring_axis_position_from_brightness: the grey code value a
 *  ring's brightness lands on. */
export function axisRgb(brightness: number): number {
  const rgb = hsbToLutRgb([0, 0, clamp01(brightness)]);
  return clamp01((rgb[0] + rgb[1] + rgb[2]) / 3);
}

export interface Anchor {
  L: number;
  rho: number;
  theta: number;
  deltaL: number;
  chromaScale: number;
  deltaTheta: number;
  weight: number;
}

function curveAt(curves: Curves, ring: Ring, channel: Channel, x: number): number {
  return channelValue(channel, samplePeriodic(curves[ring][channel], x));
}

/** _build_clut's ring loop: 192 anchors, ring-major then hue sample. */
export function ringAnchors(curves: Curves): Anchor[] {
  const out: Anchor[] = [];
  for (const ring of RINGS) {
    const B = RING_BRIGHTNESS[ring];
    const S = REFERENCE_SATURATION[ring];
    const grey = axisRgb(B);
    const axis: Vec3 = [grey, grey, grey];
    for (let h = 0; h < HUE_SAMPLES; h++) {
      const x = h / HUE_SAMPLES;
      const hue = curveXToHue(x);
      const shift = curveAt(curves, ring, CHANNELS[2], x);
      const sat = curveAt(curves, ring, CHANNELS[0], x);
      const bri = curveAt(curves, ring, CHANNELS[1], x);
      const before = projectToCubeShell(axis, hsbToLutRgb([hue, S, B]));
      const after = projectToCubeShell(
        axis,
        hsbToLutRgb([shift === 0 ? hue : wrapHuePi(hue + shift), clamp01(S * sat), clamp01(B * bri)]),
      );
      const p = rgbToGrayCyl(before);
      const q = rgbToGrayCyl(after);
      const projected = p.rho > 1e-6 ? q.rho / p.rho : 1;
      out.push({
        L: p.L,
        rho: p.rho,
        theta: p.theta,
        deltaL: q.L - p.L,
        chromaScale: sat <= 1 ? sat : Math.min(sat, projected),
        deltaTheta: wrapPi(shift),
        weight: 1,
      });
    }
  }
  return out;
}

/** The achromatic ring along the grey diagonal: no displacement, so the
 *  neutrals stay put. */
export function axisAnchors(): Anchor[] {
  return Array.from({ length: AXIS_SAMPLES }, (_, s) => ({
    L: (s / (AXIS_SAMPLES - 1)) * Math.sqrt(3),
    rho: 0,
    theta: 0,
    deltaL: 0,
    chromaScale: 1,
    deltaTheta: 0,
    weight: AXIS_WEIGHT,
  }));
}

export function allAnchors(curves: Curves): Anchor[] {
  return [...ringAnchors(curves), ...axisAnchors()];
}
