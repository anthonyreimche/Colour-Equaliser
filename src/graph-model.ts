// The graph's geometry and background, Ansel's (_draw_curve,
// _draw_graph_background, _find_selected_node in iop/colorequal.c): a plot
// inset by 4 px with a 14 px hue axis strip under it; pointer positions in
// curve coordinates; a node caught within 10 px; and, behind each channel's
// curve, the ring's colours with the channel's own effect running up the y
// axis.

import { channelValue, curveXToHue, wrapHuePi, type Channel, type CurveNode } from "./curve";
import { REFERENCE_SATURATION, RING_BRIGHTNESS, type Ring } from "./rings";
import { hsbToDisplaySrgb, type Vec3 } from "./ucs";

export const INSET = 4;
export const AXIS_HEIGHT = 14;
export const GRAPH_RES = 360;
export const GRADIENT_SLICES = 48;
export const NODE_HIT_PX = 10;
export const PLOT_ASPECT = 0.7;

export interface PlotGeometry {
  width: number;
  height: number;
  plotW: number;
  plotH: number;
}

export function plotGeometry(width: number): PlotGeometry {
  const plotH = Math.round(width * PLOT_ASPECT);
  return { width, height: plotH + AXIS_HEIGHT + 2 * INSET, plotW: width - 2 * INSET, plotH };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A canvas point in curve coordinates (x along the hue axis, y up), and
 *  whether it fell on the axis strip below the plot. */
export function toPlot(g: PlotGeometry, px: number, py: number): { x: number; y: number; onAxis: boolean } {
  return {
    x: clamp01((px - INSET) / g.plotW),
    y: clamp01(1 - (py - INSET) / g.plotH),
    onAxis: py > INSET + g.plotH,
  };
}

/** The node under the pointer, within NODE_HIT_PX; −1 for none. */
export function nearestNode(nodes: readonly CurveNode[], g: PlotGeometry, px: number, py: number): number {
  let selected = -1;
  let best = NODE_HIT_PX * NODE_HIT_PX;
  nodes.forEach((n, k) => {
    const dx = px - (INSET + n.x * g.plotW);
    const dy = py - (INSET + (1 - n.y) * g.plotH);
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      selected = k;
    }
  });
  return selected;
}

/** _graph_background_hsb: the ring's colour at curve x, with the channel's
 *  effect at y applied to it. */
export function backgroundHsb(channel: Channel, x: number, y: number, ringBrightness: number, saturation: number): Vec3 {
  const hue = curveXToHue(x);
  switch (channel) {
    case "hue":
      return [wrapHuePi(hue + channelValue(channel, y)), saturation, ringBrightness];
    case "brightness":
      return [hue, saturation, clamp01(ringBrightness * channelValue(channel, y))];
    default:
      return [hue, clamp01(saturation * channelValue(channel, y)), ringBrightness];
  }
}

/** The hue tab keeps the reference ring so its lightness cue stays readable;
 *  the other tabs boost it for contrast. */
export function backgroundSaturation(channel: Channel, ring: Ring): number {
  const reference = REFERENCE_SATURATION[ring];
  return channel === "hue" ? reference : clamp01(reference * 1.35);
}

export interface BackgroundImage {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

const backgrounds = new Map<string, BackgroundImage>();

/** GRAPH_RES × GRADIENT_SLICES RGBA of the background, the vivid end of the
 *  channel's effect at the top row, memoised per ring and channel. */
export function backgroundImage(ring: Ring, channel: Channel): BackgroundImage {
  const key = `${ring}/${channel}`;
  const cached = backgrounds.get(key);
  if (cached) return cached;
  const data = new Uint8ClampedArray(GRAPH_RES * GRADIENT_SLICES * 4);
  const brightness = RING_BRIGHTNESS[ring];
  const saturation = backgroundSaturation(channel, ring);
  for (let slice = 0; slice < GRADIENT_SLICES; slice++) {
    const y = (GRADIENT_SLICES - slice) / GRADIENT_SLICES;
    for (let k = 0; k < GRAPH_RES; k++) {
      const rgb = hsbToDisplaySrgb(backgroundHsb(channel, k / (GRAPH_RES - 1), y, brightness, saturation));
      const o = (slice * GRAPH_RES + k) * 4;
      data[o] = Math.round(rgb[0] * 255);
      data[o + 1] = Math.round(rgb[1] * 255);
      data[o + 2] = Math.round(rgb[2] * 255);
      data[o + 3] = 255;
    }
  }
  const image = { width: GRAPH_RES, height: GRADIENT_SLICES, data };
  backgrounds.set(key, image);
  return image;
}

/** The axis strip's colours: the ring at the reference saturation across the
 *  hue axis, as CSS stops. */
export function axisStops(ring: Ring, channel: Channel, count = 36): { at: number; css: string }[] {
  const brightness = RING_BRIGHTNESS[ring];
  const saturation = backgroundSaturation(channel, ring);
  const stops: { at: number; css: string }[] = [];
  for (let i = 0; i <= count; i++) {
    const at = i / count;
    const rgb = hsbToDisplaySrgb([curveXToHue(at), saturation, brightness]);
    stops.push({ at, css: `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})` });
  }
  return stops;
}
