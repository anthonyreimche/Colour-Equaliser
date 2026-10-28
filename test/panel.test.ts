// The panel and its graph, rendered without React or a DOM (support/render),
// editing the photo's bag in the dock and a mask's in the Masking panel's
// Adjust tab. In a mask everything that reads the photo — the picker and its
// reading, Adjust on image, the frame sampler behind them, and the marks they
// leave on the graph — belongs to the photo's own equaliser and is left out.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultCurve, type Channel, type CurveNode } from "../src/curve";
import { EqualiserGraph } from "../src/Graph";
import { AXIS_HEIGHT, INSET, plotGeometry } from "../src/graph-model";
import { DEFAULT_PARAMS, type Params } from "../src/model";
import { EqualiserPanel } from "../src/Panel";
import { deriveAll, readParams } from "../src/params";
import type { Ring } from "../src/rings";
import { initRuntime } from "../src/runtime";
import type { DevelopParams, DevelopStoreState, ParamScope, SafelightAPI } from "../src/safelight";
import { initStore, store } from "../src/store";
import { fakeStore } from "./support/fake-store";
import { findAll, renderer, stubDom, textOf, type Mounted } from "./support/render";

const Slider = () => null;
const Panel = () => null;
const Button = () => null;
const Select = () => null;
const SegmentedControl = () => null;
const Row = () => null;
const Stack = () => null;

/** The API over a photo bag, inside a mask holding `maskBag` when one is given. */
function rig(photoBag: Record<string, unknown> = {}, maskBag?: Record<string, unknown>) {
  const commits: string[] = [];
  const captures: DevelopParams[] = [];
  const renders: Record<string, unknown>[] = [];
  const settings = new Map<string, unknown>();
  const develop = fakeStore<DevelopStoreState>({
    photoId: "p1",
    params: {} as DevelopParams,
    previewParams: null,
    paramBag: photoBag,
    histogram: null,
    setDynParams: (patch) => develop.setState((s) => ({ paramBag: { ...s.paramBag, ...patch } })),
    commitEdit: async (label) => void commits.push(label),
  });
  const mask = fakeStore({ bag: maskBag ?? {} });
  const photoScope: ParamScope = {
    maskId: null,
    getParam: (key) => develop.getState().paramBag[key],
    getParams: () => develop.getState().paramBag,
    setParams: (patch) => develop.getState().setDynParams(patch),
    commit: (label) => void develop.getState().commitEdit(label),
  };
  const maskScope: ParamScope = {
    maskId: "mask-1",
    getParam: (key) => mask.getState().bag[key],
    getParams: () => mask.getState().bag,
    setParams: (patch) => mask.setState((s) => ({ bag: { ...s.bag, ...patch } })),
    commit: (label) => void commits.push(`mask: ${label}`),
  };
  const { react, mount } = renderer();
  initRuntime({
    react,
    settings: {
      get: <T,>(key: string, fallback: T) => (settings.has(key) ? (settings.get(key) as T) : fallback),
      set: (key: string, value: unknown) => void settings.set(key, value),
      onChange: () => () => undefined,
    },
    components: { Slider, Panel },
    ui: { Button, Select, SegmentedControl, Row, Stack, tokens: { surface0: "rgb(30, 30, 30)" } },
    stores: { create: fakeStore, useDevelopStore: develop },
    develop: {
      captureFrame: (params: DevelopParams) => {
        captures.push(params);
        return new Promise<ImageBitmap>(() => undefined);
      },
      renderPhotoFrame: (_photoId: string, _params: DevelopParams, bag?: Record<string, unknown>) => {
        renders.push(bag ?? {});
        return new Promise<ImageBitmap | null>(() => undefined);
      },
      useParamScope: () => (maskBag === undefined ? photoScope : maskScope),
    },
  } as unknown as SafelightAPI);
  initStore();
  return { develop, mask, commits, captures, renders, settings, mount };
}

const withCurve = (ring: Ring, channel: Channel, nodes: readonly CurveNode[], p: Params = DEFAULT_PARAMS): Params => ({
  ...p,
  curves: { ...p.curves, [ring]: { ...p.curves[ring], [channel]: nodes } },
});
const raised = (y: number) => defaultCurve().map((n, k) => (k === 2 ? { ...n, y } : n));

const buttons = (m: Mounted) => findAll(m.tree, (e) => e.type === Button).map(textOf);

let mounted: Mounted | null = null;
const keep = (m: Mounted) => (mounted = m);

beforeEach(() => stubDom());

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("EqualiserPanel in the dock", () => {
  it("offers the picker and Adjust on image, and samples the photo for them", () => {
    vi.useFakeTimers();
    const r = rig();
    const m = keep(r.mount(EqualiserPanel, {}));
    expect(buttons(m)).toEqual(["Pick", "Adjust on image"]);
    expect(textOf(m.tree)).toContain("No sample");
    vi.runOnlyPendingTimers();
    expect(r.captures.length).toBe(1);
    expect(r.renders.length).toBe(1);
  });

  it("clears the on-image mode when it closes", () => {
    const r = rig();
    const m = r.mount(EqualiserPanel, {});
    store().getState().setMode("adjust");
    m.unmount();
    expect(store().getState().mode).toBeNull();
  });
});

describe("EqualiserPanel in a mask", () => {
  it("leaves out the picker, its reading and Adjust on image, and never samples the photo", () => {
    vi.useFakeTimers();
    const r = rig({}, {});
    const m = keep(r.mount(EqualiserPanel, {}));
    expect(buttons(m)).toEqual([]);
    expect(textOf(m.tree)).not.toContain("No sample");
    expect(textOf(m.tree)).not.toContain("Adjust on image");
    vi.runOnlyPendingTimers();
    expect(r.captures).toEqual([]);
    expect(r.renders).toEqual([]);
  });

  it("keeps the ring and channel tabs and the graph", () => {
    const r = rig({}, {});
    const m = keep(r.mount(EqualiserPanel, {}));
    expect(findAll(m.tree, (e) => e.type === SegmentedControl).length).toBe(2);
    expect(findAll(m.tree, (e) => e.type === EqualiserGraph).map((e) => [e.props.ring, e.props.channel])).toEqual([
      ["shadows", "saturation"],
    ]);
  });

  it("leaves the photo's on-image mode alone when it closes", () => {
    const r = rig({}, {});
    const m = r.mount(EqualiserPanel, {});
    store().getState().setMode("adjust");
    m.unmount();
    expect(store().getState().mode).toBe("adjust");
  });

  it("shows and writes the mask's options, leaving the photo's alone", () => {
    const photo = deriveAll({ ...DEFAULT_PARAMS, whiteLevel: 1.5 });
    const own = { ...DEFAULT_PARAMS, whiteLevel: -1 };
    const r = rig(photo, deriveAll(own));
    r.settings.set("ring", "options");
    const m = keep(r.mount(EqualiserPanel, {}));
    const white = findAll(m.tree, (e) => e.type === Slider && e.props.label === "White level")[0].props as {
      value: number;
      onChange(v: number): void;
      onCommit(): void;
    };
    expect(white.value).toBe(-1);
    white.onChange(2.5);
    white.onCommit();
    expect(r.mask.getState().bag).toEqual(deriveAll({ ...own, whiteLevel: 2.5 }));
    expect(r.develop.getState().paramBag).toEqual(photo);
    expect(r.commits).toEqual(["mask: Colour Equaliser white level"]);
  });
});

describe("EqualiserGraph", () => {
  const g = plotGeometry(240);
  /** Node marks drawn on the canvas, as curve coordinates. */
  const drawnNodes = (m: Mounted) =>
    m.canvases[0].calls
      .filter((c) => c.op === "arc" && (c.args[2] === 4 || c.args[2] === 5))
      .map((c) => ({ x: ((c.args[0] as number) - INSET) / g.plotW, y: 1 - ((c.args[1] as number) - INSET) / g.plotH }));
  /** Lines down the plot and the hue axis together: the picker's and the cursor's. */
  const markLines = (m: Mounted) => {
    const calls = m.canvases[0].calls;
    return calls.filter(
      (c, i) =>
        c.op === "moveTo" &&
        c.args[1] === INSET &&
        calls[i + 1]?.op === "lineTo" &&
        calls[i + 1].args[0] === c.args[0] &&
        calls[i + 1].args[1] === INSET + g.plotH + AXIS_HEIGHT,
    ).length;
  };
  const markBoth = () => {
    store().getState().setPicker({ hue: 1, brightness: 0.5 });
    store().getState().setMode("adjust");
    store().getState().setCursor({ hue: -2, inputRgb: [0.2, 0.3, 0.4], outputRgb: [0.3, 0.3, 0.3], local: { x: 5, y: 5 } });
  };

  it("in the dock marks the photo's picker and its on-image cursor", () => {
    const r = rig();
    markBoth();
    const m = keep(r.mount(EqualiserGraph, { ring: "shadows", channel: "saturation" }));
    // The picker's line, then the cursor's: a dark outline under its colour.
    expect(markLines(m)).toBe(3);
  });

  it("in a mask draws the mask's curve, not the photo's", () => {
    const own = raised(0.8);
    const r = rig(deriveAll(withCurve("shadows", "saturation", raised(0.2))), deriveAll(withCurve("shadows", "saturation", own)));
    const m = keep(r.mount(EqualiserGraph, { ring: "shadows", channel: "saturation" }));
    const drawn = drawnNodes(m);
    expect(drawn.length).toBe(own.length);
    drawn.forEach((n, k) => {
      expect(n.x).toBeCloseTo(own[k].x, 9);
      expect(n.y).toBeCloseTo(own[k].y, 9);
    });
  });

  it("in a mask marks neither the photo's picker nor its on-image cursor", () => {
    const r = rig({}, {});
    markBoth();
    const m = keep(r.mount(EqualiserGraph, { ring: "shadows", channel: "saturation" }));
    expect(markLines(m)).toBe(0);
  });

  it("in a mask resets the mask's curve on double-click, leaving the photo's alone", () => {
    const photo = deriveAll(withCurve("shadows", "saturation", raised(0.2)));
    const own = withCurve("shadows", "saturation", raised(0.8));
    const r = rig(photo, deriveAll(own));
    const m = keep(r.mount(EqualiserGraph, { ring: "shadows", channel: "saturation" }));
    const canvas = findAll(m.tree, (e) => e.type === "canvas")[0].props as { onDoubleClick(): void };
    canvas.onDoubleClick();
    expect(readParams(r.mask.getState().bag)).toEqual(readParams(deriveAll(withCurve("shadows", "saturation", defaultCurve(), own))));
    expect(r.develop.getState().paramBag).toEqual(photo);
    expect(r.commits).toEqual(["mask: Colour Equaliser reset curve"]);
  });
});
