// The hue curves of Ansel's colour equalizer: the periodic monotone Hermite
// spline (interpolate_val_V2_periodic with MONOTONE_HERMITE and period 1, from
// darktable's math/splines.cpp, © Heiko Bauke, Pascal Obry, GPL-3.0-or-later),
// the value each channel reads from a node's y, the graph's hue convention,
// and the node and scroll rules of iop/colorequal.c (© Aurélien Pierre).

import { FLT_EPSILON } from "./ucs";

export interface CurveNode {
  x: number;
  y: number;
}

/** In the panel's tab order. */
export type Channel = "saturation" | "brightness" | "hue";
export const CHANNELS: readonly Channel[] = ["saturation", "brightness", "hue"];

export const MAX_NODES = 20;
export const DEFAULT_NODES = 8;
export const MIN_NODES = 2;
export const MIN_X_DISTANCE = 0.01;
export const MAX_NODE_X = 0.999;
/** The dt UCS hue of sRGB red sits near +20°; the graph shifts so red is at
 *  its left edge. */
export const ANGLE_SHIFT_DEG = 20;
/** The on-image wheel's reach, in curve x. */
export const SCROLL_SIGMA = (2 * Math.PI) / 128;

const TWO_PI = 2 * Math.PI;

export function defaultCurve(): CurveNode[] {
  return Array.from({ length: DEFAULT_NODES }, (_, k) => ({ x: k / DEFAULT_NODES, y: 0.5 }));
}

/** x wrapped into [0, 1) and the nodes sorted by it — the spline's own
 *  preparation, and the order the shader assumes. */
export function normaliseNodes(nodes: readonly CurveNode[]): CurveNode[] {
  return nodes
    .map((n) => ({ x: n.x - Math.floor(n.x), y: n.y }))
    .sort((a, b) => a.x - b.x);
}

/** The curve's value at x, periodic with period 1; 0.5 below two nodes. */
export function samplePeriodic(nodes: readonly CurveNode[], x: number): number {
  if (nodes.length < 2) return 0.5;
  const pts = normaliseNodes(nodes);
  const n = pts.length;
  const D = new Array<number>(n);
  for (let i = 0; i < n - 1; i++) D[i] = (pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x);
  D[n - 1] = (pts[0].y - pts[n - 1].y) / (pts[0].x - pts[n - 1].x + 1);
  const dy = new Array<number>(n);
  dy[0] = D[n - 1] * D[0] <= 0 ? 0 : (D[n - 1] + D[0]) / 2;
  for (let i = 1; i < n; i++) dy[i] = D[i - 1] * D[i] <= 0 ? 0 : (D[i - 1] + D[i]) / 2;
  // Fritsch–Carlson, segment by segment in index order: later segments see
  // the tangents earlier ones limited.
  for (let i = 0; i < n; i++) {
    const i1 = i + 1 < n ? i + 1 : 0;
    if (Math.abs(D[i]) < FLT_EPSILON) {
      dy[i] = 0;
      dy[i1] = 0;
    } else {
      const alpha = dy[i] / D[i];
      const beta = dy[i1] / D[i];
      const tau = alpha * alpha + beta * beta;
      if (tau > 9) {
        dy[i] = (3 * alpha * D[i]) / Math.sqrt(tau);
        dy[i1] = (3 * beta * D[i]) / Math.sqrt(tau);
      }
    }
  }
  let t = x - Math.floor(x);
  if (t < pts[0].x) t += 1;
  let n0 = n - 1;
  for (let i = 0; i < n; i++) {
    if (pts[i].x > t) {
      n0 = i - 1;
      break;
    }
  }
  const n1 = n0 + 1 < n ? n0 + 1 : 0;
  const h = n1 > n0 ? pts[n1].x - pts[n0].x : pts[n1].x - (pts[n0].x - 1);
  const u = (t - pts[n0].x) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  // h00·y0 + h01·y1 written as y0 + h01·(y1 − y0): the same cubic, exact on
  // a flat curve.
  return pts[n0].y + (pts[n1].y - pts[n0].y) * h01 + h * (dy[n0] * h10 + dy[n1] * h11);
}

/** _channel_value_from_y: a hue shift in radians, or a gain in [0, 2]. */
export function channelValue(channel: Channel, y: number): number {
  if (channel === "hue") return (y - 0.5) * TWO_PI;
  const v = y * 2;
  return v < 0 ? 0 : v > 2 ? 2 : v;
}

/** _channel_y_from_value, the inverse, clamped to the graph. */
export function channelY(channel: Channel, value: number): number {
  const y = channel === "hue" ? value / TWO_PI + 0.5 : value * 0.5;
  return y < 0 ? 0 : y > 1 ? 1 : y;
}

export function wrapHue2Pi(hue: number): number {
  while (hue < 0) hue += TWO_PI;
  while (hue >= TWO_PI) hue -= TWO_PI;
  return hue;
}

export function wrapHuePi(hue: number): number {
  return wrapHue2Pi(hue + Math.PI) - Math.PI;
}

/** dt_colorrings_wrap_pi: into (−π, π]. */
export function wrapPi(x: number): number {
  while (x <= -Math.PI) x += TWO_PI;
  while (x > Math.PI) x -= TWO_PI;
  return x;
}

export function curveXToHue(x: number): number {
  return wrapHuePi(((360 * x + ANGLE_SHIFT_DEG) * Math.PI) / 180);
}

export function hueToCurveX(hue: number): number {
  return wrapHue2Pi(hue - (ANGLE_SHIFT_DEG * Math.PI) / 180) / TWO_PI;
}

export function periodicDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

/** _add_node: insert by x, refused within MIN_X_DISTANCE of a neighbour or
 *  at the node cap. Ansel measures only the linear neighbours; here the ends
 *  are also measured across the wrap, as moveNode does, so a node at the seam
 *  can neither crowd nor coincide with the first node (x = 1 is node 0). */
export function addNode(nodes: readonly CurveNode[], x: number, y: number): { nodes: CurveNode[]; index: number } | null {
  if (nodes.length >= MAX_NODES) return null;
  let index = nodes.length;
  if (nodes[0].x > x) index = 0;
  else {
    for (let k = 1; k < nodes.length; k++) {
      if (nodes[k].x > x) {
        index = k;
        break;
      }
    }
  }
  const before = index > 0 ? nodes[index - 1].x : nodes[nodes.length - 1].x - 1;
  const after = index < nodes.length ? nodes[index].x : nodes[0].x + 1;
  if (x - before <= MIN_X_DISTANCE || after - x <= MIN_X_DISTANCE) return null;
  const next = [...nodes];
  next.splice(index, 0, { x, y });
  return { nodes: next, index };
}

/** _move_selected_node: x clamped to [0, 0.999] and kept MIN_X_DISTANCE from
 *  the neighbours (the end nodes measured across the wrap, which can leave the
 *  first node's x negative, as in Ansel); an interior move that would cross a
 *  neighbour is refused. */
export function moveNode(nodes: readonly CurveNode[], index: number, x: number, y: number): CurveNode[] | null {
  const n = nodes.length;
  let nx = x < 0 ? 0 : x > MAX_NODE_X ? MAX_NODE_X : x;
  const ny = y < 0 ? 0 : y > 1 ? 1 : y;
  if (index === 0) {
    if (nx + 1 - nodes[n - 1].x < MIN_X_DISTANCE) nx = nodes[n - 1].x + MIN_X_DISTANCE - 1;
  } else if (index === n - 1) {
    if (nodes[0].x + 1 - nx < MIN_X_DISTANCE) nx = nodes[0].x + 1 - MIN_X_DISTANCE;
  } else if (nx - nodes[index - 1].x < MIN_X_DISTANCE || nodes[index + 1].x - nx < MIN_X_DISTANCE) {
    return null;
  }
  const next = [...nodes];
  next[index] = { x: nx, y: ny };
  return next;
}

/** The right-click removal: only above MIN_NODES. */
export function removeNode(nodes: readonly CurveNode[], index: number): CurveNode[] | null {
  if (nodes.length <= MIN_NODES || index < 0 || index >= nodes.length) return null;
  const next = [...nodes];
  next.splice(index, 1);
  return next;
}

export type ScrollStep = "normal" | "coarse" | "fine";

/** scrolled(): the wheel's step per notch, a gain or a hue angle. */
export function scrollStep(channel: Channel, step: ScrollStep): number {
  if (channel === "hue") return ((step === "coarse" ? 10 : step === "fine" ? 1 : 5) * Math.PI) / 180;
  return step === "coarse" ? 0.1 : step === "fine" ? 0.02 : 0.05;
}

/** scrolled(): every node moves by the step weighted by a Gaussian of its
 *  distance in curve x from the cursor's hue. */
export function scrollCurve(
  nodes: readonly CurveNode[],
  channel: Channel,
  cursorX: number,
  direction: 1 | -1,
  step: ScrollStep,
): CurveNode[] {
  const amount = scrollStep(channel, step) * direction;
  const sigma2 = 2 * SCROLL_SIGMA * SCROLL_SIGMA;
  return nodes.map((node) => {
    const d = periodicDistance(node.x, cursorX);
    const weight = Math.exp(-(d * d) / sigma2);
    let value = channelValue(channel, node.y) + amount * weight;
    if (channel === "hue") value = value < -Math.PI ? -Math.PI : value > Math.PI ? Math.PI : value;
    else value = value < 0 ? 0 : value > 2 ? 2 : value;
    return { x: node.x, y: channelY(channel, value) };
  });
}

export function curveFlat(nodes: readonly CurveNode[]): boolean {
  return nodes.every((n) => n.y === 0.5);
}
