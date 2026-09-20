// The graph's pure geometry and background: Ansel's inset and axis strip,
// pointer ↔ curve coordinates, the node hit radius, and the gradient the
// ring's colours make behind each channel's curve (_graph_background_hsb).

import { describe, expect, it } from "vitest";
import { channelValue, curveXToHue, defaultCurve, wrapHuePi } from "../src/curve";
import {
  AXIS_HEIGHT,
  GRADIENT_SLICES,
  GRAPH_RES,
  INSET,
  NODE_HIT_PX,
  PLOT_ASPECT,
  backgroundHsb,
  backgroundImage,
  backgroundSaturation,
  nearestNode,
  plotGeometry,
  toPlot,
} from "../src/graph-model";
import { REFERENCE_SATURATION } from "../src/rings";

describe("plotGeometry", () => {
  it("keeps Ansel's inset and axis strip around a 0.7 plot", () => {
    expect([INSET, AXIS_HEIGHT, PLOT_ASPECT]).toEqual([4, 14, 0.7]);
    const g = plotGeometry(252);
    expect(g).toEqual({ width: 252, height: 198, plotW: 244, plotH: 176 });
  });

  it("maps the plot's corners to the curve's and flags the axis strip", () => {
    const g = plotGeometry(252);
    expect(toPlot(g, INSET, INSET)).toEqual({ x: 0, y: 1, onAxis: false });
    expect(toPlot(g, INSET + g.plotW, INSET + g.plotH)).toEqual({ x: 1, y: 0, onAxis: false });
    expect(toPlot(g, -20, 5000)).toEqual({ x: 0, y: 0, onAxis: true });
    expect(toPlot(g, INSET + g.plotW / 2, INSET + g.plotH + 5).onAxis).toBe(true);
  });
});

describe("nearestNode", () => {
  it("selects a node within 10 px and nothing further", () => {
    const g = plotGeometry(252);
    const nodes = defaultCurve();
    const px = INSET + nodes[3].x * g.plotW;
    const py = INSET + (1 - nodes[3].y) * g.plotH;
    expect(NODE_HIT_PX).toBe(10);
    expect(nearestNode(nodes, g, px, py)).toBe(3);
    expect(nearestNode(nodes, g, px + 6, py - 6)).toBe(3);
    expect(nearestNode(nodes, g, px, py + 15)).toBe(-1);
    expect(nearestNode([], g, px, py)).toBe(-1);
  });
});

describe("background", () => {
  it("shows what each channel's curve does to the ring", () => {
    const hue = backgroundHsb("hue", 0.25, 0.75, 0.45, 0.09);
    expect(hue[0]).toBeCloseTo(wrapHuePi(curveXToHue(0.25) + channelValue("hue", 0.75)), 12);
    expect(hue[1]).toBe(0.09);
    expect(hue[2]).toBe(0.45);
    const sat = backgroundHsb("saturation", 0.3, 0.25, 0.45, 0.09);
    expect(sat[1]).toBeCloseTo(0.045, 12);
    expect(sat[2]).toBe(0.45);
    const bri = backgroundHsb("brightness", 0.3, 1, 0.45, 0.09);
    expect(bri[2]).toBeCloseTo(0.9, 12);
    expect(bri[1]).toBe(0.09);
  });

  it("boosts the reference saturation by 1.35 except on the hue tab", () => {
    expect(backgroundSaturation("hue", "midtones")).toBe(REFERENCE_SATURATION.midtones);
    expect(backgroundSaturation("saturation", "midtones")).toBeCloseTo(Math.min(1, REFERENCE_SATURATION.midtones * 1.35), 12);
  });

  it("renders the gradient with the vivid end at the top and memoises it", () => {
    const img = backgroundImage("midtones", "saturation");
    expect(img.width).toBe(GRAPH_RES);
    expect(img.height).toBe(GRADIENT_SLICES);
    expect(img.data.length).toBe(GRAPH_RES * GRADIENT_SLICES * 4);
    const spread = (row: number) => {
      const o = (row * GRAPH_RES + 180) * 4;
      const rgb = [img.data[o], img.data[o + 1], img.data[o + 2]];
      return Math.max(...rgb) - Math.min(...rgb);
    };
    expect(spread(0)).toBeGreaterThan(spread(GRADIENT_SLICES - 1) + 20);
    expect(img.data[3]).toBe(255);
    expect(backgroundImage("midtones", "saturation")).toBe(img);
  });
});
