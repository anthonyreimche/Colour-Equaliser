// The on-image hue picker on core's pick-drag tool: a press's canvas point
// read through core's sampleView with this stage bypassed, its patch's hue and
// brightness marked, and Pick ended; a press core can't sample (off the frame,
// another photo opened), or one whose sample lands after Pick ended, marks
// nothing.

import { afterEach, describe, expect, it } from "vitest";
import { wrapHuePi } from "../src/curve";
import { KEY } from "../src/params";
import { holdPickDrag, readingOf } from "../src/picker";
import { initRuntime } from "../src/runtime";
import type { CanvasPoint, DevelopStoreState, PickDragTool, SafelightAPI } from "../src/safelight";
import { initStore, store } from "../src/store";
import { linearSrgbToHsb, srgbToLinear, type Vec3 } from "../src/ucs";
import { fakeStore } from "./support/fake-store";

const ENCODED: readonly [number, number, number] = [180 / 255, 90 / 255, 40 / 255];
const LINEAR: Vec3 = [srgbToLinear(ENCODED[0]), srgbToLinear(ENCODED[1]), srgbToLinear(ENCODED[2])];

type Rgb = readonly [number, number, number];

function rig() {
  const pickDrags: (PickDragTool | null)[] = [];
  const samples: { point: CanvasPoint; bag?: Record<string, unknown> }[] = [];
  let land: ((rgb: Rgb | null) => void) | null = null;
  const develop = fakeStore<DevelopStoreState>({ photoId: "p1", paramBag: {} } as Partial<DevelopStoreState> as DevelopStoreState);
  initRuntime({
    stores: { create: fakeStore, useDevelopStore: develop },
    develop: {
      setPickDrag: (tool: PickDragTool | null) => void pickDrags.push(tool),
      sampleView: (point: CanvasPoint, bag?: Record<string, unknown>) => {
        samples.push({ point, bag });
        return new Promise<Rgb | null>((resolve) => (land = resolve));
      },
    },
  } as unknown as SafelightAPI);
  initStore();
  const stop = holdPickDrag();
  const press = (x: number, y: number) => {
    pickDrags[pickDrags.length - 1]?.onPress?.({ x, y });
    return { land: async (rgb: Rgb | null) => (land?.(rgb), await Promise.resolve(), await Promise.resolve()) };
  };
  return { develop, pickDrags, samples, press, stop };
}

let stop: (() => void) | null = null;

afterEach(() => {
  stop?.();
  stop = null;
});

describe("readingOf", () => {
  it("gives the colour's dt UCS hue in (−π, π] and its brightness held to 0..1", () => {
    const hsb = linearSrgbToHsb(LINEAR);
    expect(readingOf(LINEAR)).toEqual({ hue: wrapHuePi(hsb[0]), brightness: hsb[2] });
    expect(readingOf([4, 2, 1])?.brightness).toBe(1);
  });
});

describe("the pick", () => {
  it("holds core's pick-drag tool only while Pick is on", () => {
    const r = rig();
    stop = r.stop;
    store().getState().setMode("pick");
    expect(r.pickDrags).toEqual([expect.objectContaining({ onPress: expect.any(Function) })]);
    store().getState().setMode("adjust");
    store().getState().setMode(null);
    expect(r.pickDrags).toHaveLength(2);
    expect(r.pickDrags[1]).toBeNull();
  });

  it("reads the press through core's sampleView with this stage bypassed, marks its hue and brightness and ends Pick", async () => {
    const r = rig();
    stop = r.stop;
    store().getState().setMode("pick");
    await r.press(200, 100).land(ENCODED);
    expect(r.samples).toEqual([{ point: { x: 200, y: 100 }, bag: { [KEY.on]: 0 } }]);
    const expected = readingOf(LINEAR);
    expect(store().getState().picker?.hue).toBeCloseTo(expected?.hue ?? NaN, 6);
    expect(store().getState().picker?.brightness).toBeCloseTo(expected?.brightness ?? NaN, 6);
    expect(store().getState().mode).toBeNull();
  });

  it("marks nothing, and keeps Pick on, for a press core can't sample", async () => {
    const r = rig();
    stop = r.stop;
    store().getState().setMode("pick");
    await r.press(500, 100).land(null);
    expect(store().getState().picker).toBeNull();
    expect(store().getState().mode).toBe("pick");
  });

  it("drops a sample that lands after Pick ended", async () => {
    const r = rig();
    stop = r.stop;
    store().getState().setMode("pick");
    const ended = r.press(200, 100);
    store().getState().setMode(null);
    await ended.land(ENCODED);
    expect(store().getState().picker).toBeNull();
  });
});
