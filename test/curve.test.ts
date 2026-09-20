// The hue curves: Ansel's periodic monotone Hermite spline against samples
// from the vendored splines.cpp, the value ↔ y mapping of the three channels,
// the hue ↔ curve-x convention, and the node rules (add, move, remove, reset)
// and the on-image scroll model from colorequal.c.

import { describe, expect, it } from "vitest";
import {
  MAX_NODES,
  MIN_X_DISTANCE,
  SCROLL_SIGMA,
  addNode,
  channelValue,
  channelY,
  curveFlat,
  curveXToHue,
  defaultCurve,
  hueToCurveX,
  moveNode,
  normaliseNodes,
  periodicDistance,
  removeNode,
  samplePeriodic,
  scrollCurve,
  scrollStep,
  type CurveNode,
} from "../src/curve";
import { V } from "./support/vectors";

const nodesOf = (pairs: [number, number][]): CurveNode[] => pairs.map(([x, y]) => ({ x, y }));

describe("samplePeriodic", () => {
  it("matches Ansel's periodic monotone Hermite for every node set", () => {
    for (const set of V.spline) {
      const nodes = nodesOf(set.nodes);
      for (const [x, y] of set.samples) expect(Math.abs(samplePeriodic(nodes, x) - y)).toBeLessThan(5e-6);
    }
  });

  it("is exactly flat on a flat curve", () => {
    const nodes = defaultCurve();
    for (let i = 0; i < 97; i++) expect(samplePeriodic(nodes, i / 97)).toBe(0.5);
  });

  it("answers 0.5 with fewer than two nodes", () => {
    expect(samplePeriodic([{ x: 0, y: 1 }], 0.3)).toBe(0.5);
    expect(samplePeriodic([], 0.3)).toBe(0.5);
  });

  it("wraps the query into the period", () => {
    const nodes = nodesOf(V.spline[3].nodes);
    expect(samplePeriodic(nodes, 1.37)).toBeCloseTo(samplePeriodic(nodes, 0.37), 12);
    expect(samplePeriodic(nodes, -0.63)).toBeCloseTo(samplePeriodic(nodes, 0.37), 12);
  });
});

describe("channel mapping", () => {
  it("maps y to Ansel's values and back", () => {
    expect(channelValue("hue", 0.75)).toBeCloseTo(Math.PI / 2, 12);
    expect(channelValue("saturation", 1.2)).toBe(2);
    expect(channelValue("brightness", 0.25)).toBe(0.5);
    expect(channelY("hue", -Math.PI)).toBe(0);
    expect(channelY("saturation", 3)).toBe(1);
    expect(channelY("brightness", 1)).toBe(0.5);
  });

  it("puts red (+20°) at the left edge of the graph", () => {
    expect(curveXToHue(0)).toBeCloseTo((20 * Math.PI) / 180, 12);
    expect(hueToCurveX(curveXToHue(0.37))).toBeCloseTo(0.37, 9);
    expect(hueToCurveX(curveXToHue(0.99))).toBeCloseTo(0.99, 9);
    expect(periodicDistance(0.05, 0.95)).toBeCloseTo(0.1, 12);
  });
});

describe("node rules", () => {
  it("refuses a node closer than 0.01 to a neighbour, else inserts in x order", () => {
    expect(addNode(defaultCurve(), 0.126, 0.7)).toBeNull();
    const added = addNode(defaultCurve(), 0.06, 0.7);
    expect(added).not.toBeNull();
    expect(added!.index).toBe(1);
    expect(added!.nodes.length).toBe(9);
    expect(added!.nodes[1]).toEqual({ x: 0.06, y: 0.7 });
    expect(addNode(defaultCurve(), 0.95, 0.2)!.index).toBe(8);
  });

  it("measures the ends across the wrap too", () => {
    expect(addNode(defaultCurve(), 0.995, 0.7)).toBeNull();
    expect(addNode(defaultCurve(), 1, 0.7)).toBeNull();
    expect(addNode(defaultCurve(), 0.985, 0.7)!.index).toBe(8);
    const late = nodesOf([[0.3, 0.5], [0.995, 0.5]]);
    expect(addNode(late, 0.002, 0.7)).toBeNull();
    expect(addNode(late, 0.02, 0.7)!.index).toBe(0);
  });

  it("never grows past 20 nodes nor shrinks below 2", () => {
    let nodes = defaultCurve();
    for (let k = 0; k < 40; k++) {
      const next = addNode(nodes, (k + 0.5) / 40, 0.5);
      if (next) nodes = next.nodes;
    }
    expect(nodes.length).toBe(MAX_NODES);
    expect(removeNode(nodesOf([[0, 0.5], [0.5, 0.5]]), 0)).toBeNull();
    expect(removeNode(defaultCurve(), 2)!.length).toBe(7);
  });

  it("moves a node within its neighbours, the end nodes across the wrap", () => {
    const d = defaultCurve();
    expect(moveNode(d, 3, 0.255, 0.5)).toBeNull();
    expect(moveNode(d, 3, 0.4, 1.4)![3]).toEqual({ x: 0.4, y: 1 });
    // An end node is only measured against its wrap neighbour, as in Ansel.
    expect(moveNode(d, 0, 0.99, 0.5)![0].x).toBe(0.99);
    const tight = [...d];
    tight[7] = { x: 0.995, y: 0.5 };
    expect(moveNode(tight, 0, 0.001, 0.5)![0].x).toBeCloseTo(0.995 + MIN_X_DISTANCE - 1, 12);
    // Clamped to 0.999 first, then kept 0.01 short of node 0 across the wrap.
    const last = moveNode(d, 7, 0.9995, 0.5)!;
    expect(last[7].x).toBeCloseTo(0.99, 12);
  });

  it("normalises wrapped and unsorted nodes for the shader", () => {
    const n = normaliseNodes(nodesOf([[1.2, 0.1], [0.5, 0.2], [-0.25, 0.3]]));
    expect(n.map((p) => p.y)).toEqual([0.1, 0.2, 0.3]);
    [0.2, 0.5, 0.75].forEach((x, i) => expect(n[i].x).toBeCloseTo(x, 12));
  });

  it("knows a flat curve", () => {
    expect(curveFlat(defaultCurve())).toBe(true);
    expect(curveFlat(nodesOf([[0, 0.5], [0.3, 0.5001]]))).toBe(false);
  });
});

describe("scroll model", () => {
  it("steps gains by 0.05 / 0.10 / 0.02 and hue by 5° / 10° / 1°", () => {
    expect(scrollStep("saturation", "normal")).toBe(0.05);
    expect(scrollStep("brightness", "coarse")).toBe(0.1);
    expect(scrollStep("saturation", "fine")).toBe(0.02);
    expect(scrollStep("hue", "normal")).toBeCloseTo((5 * Math.PI) / 180, 12);
    expect(scrollStep("hue", "fine")).toBeCloseTo(Math.PI / 180, 12);
    expect(SCROLL_SIGMA).toBeCloseTo((2 * Math.PI) / 128, 12);
  });

  it("pulls the node under the cursor by a full step and far nodes by nothing", () => {
    const next = scrollCurve(defaultCurve(), "saturation", 0.375, 1, "normal");
    expect(next[3].y).toBeCloseTo(0.525, 12);
    expect(Math.abs(next[0].y - 0.5)).toBeLessThan(1e-6);
    const down = scrollCurve(nodesOf([[0, 0.02], [0.5, 0.5]]), "brightness", 0, -1, "coarse");
    expect(down[0].y).toBe(0);
    const hue = scrollCurve(nodesOf([[0, 0.99], [0.5, 0.5]]), "hue", 0, 1, "coarse");
    expect(hue[0].y).toBe(1);
  });
});
