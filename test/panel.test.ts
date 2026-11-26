// The panel and its graph, rendered without React or a DOM (support/render),
// editing the photo's bag in the dock and a mask's in the Masking panel's
// Adjust tab. In a mask everything that reads the photo — the picker and its
// reading, Adjust on image, the frame sampler behind them, and the marks they
// leave on the graph — belongs to the photo's own equaliser and is left out.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultCurve, type Channel, type CurveNode } from "../src/curve";
import { EqualiserGraph, GRAPH_HINT } from "../src/Graph";
import { AXIS_HEIGHT, INSET, plotGeometry } from "../src/graph-model";
import { DEFAULT_PARAMS, type Params } from "../src/model";
import { EqualiserTool } from "../src/Overlay";
import { EqualiserPanel } from "../src/Panel";
import { deriveAll, KEY, readParams } from "../src/params";
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
const PickerIcon = () => null;

/** The API over a photo bag, inside a mask holding `maskBag` when one is given. */
function rig(photoBag: Record<string, unknown> = {}, maskBag?: Record<string, unknown>) {
  const held = { pickDrag: false, canvasTool: false };
  const commits: string[] = [];
  const captures: DevelopParams[] = [];
  const renders: Record<string, unknown>[] = [];
  const view = { rect: { x: 0, y: 0, w: 600, h: 400 } as { x: number; y: number; w: number; h: number } | null, nonce: 1 };
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
  const theme = fakeStore({ activeId: "safelight-neutral" });
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
    components: { Slider, Panel, PickerIcon },
    ui: { Button, Select, SegmentedControl, Row, Stack, tokens: { surface0: "rgb(30, 30, 30)", textMuted: "muted-token", textSecondary: "secondary-token" } },
    stores: { create: fakeStore, useDevelopStore: develop, useThemeStore: theme },
    cursors: { resolve: (token: string) => token },
    develop: {
      captureFrame: (params: DevelopParams, options?: { paramBag?: Record<string, unknown> }) => {
        if (options?.paramBag) renders.push(options.paramBag);
        else captures.push(params);
        return new Promise<ImageBitmap>(() => undefined);
      },
      useDevelopOverlay: () => view,
      framePoint: (_el: Element, x: number, y: number) => ({ x, y }),
      useParamScope: () => (maskBag === undefined ? photoScope : maskScope),
      usePickDragHeld: () => held.pickDrag,
      useCanvasToolHeld: () => held.canvasTool,
    },
  } as unknown as SafelightAPI);
  initStore();
  return { develop, mask, theme, commits, captures, renders, settings, held, view, mount };
}

const withCurve = (ring: Ring, channel: Channel, nodes: readonly CurveNode[], p: Params = DEFAULT_PARAMS): Params => ({
  ...p,
  curves: { ...p.curves, [ring]: { ...p.curves[ring], [channel]: nodes } },
});
const raised = (y: number) => defaultCurve().map((n, k) => (k === 2 ? { ...n, y } : n));

const buttons = (m: Mounted) => findAll(m.tree, (e) => e.type === Button).map((e) => textOf(e).trim());

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
  it("offers the picker and Adjust on image, and samples nothing while neither is on", () => {
    vi.useFakeTimers();
    const r = rig();
    const m = keep(r.mount(EqualiserPanel, {}));
    expect(buttons(m)).toEqual(["Pick", "Adjust on image"]);
    expect(textOf(m.tree)).toContain("No sample");
    vi.runOnlyPendingTimers();
    expect(r.captures).toEqual([]);
    expect(r.renders).toEqual([]);
  });

  it("samples the view while Adjust on image is on, the input with the stage bypassed, and stops with it", () => {
    vi.useFakeTimers();
    const r = rig();
    store().getState().setMode("adjust");
    const m = r.mount(EqualiserTool, { rect: { x: -300, y: -200, w: 1200, h: 800 } });
    vi.runOnlyPendingTimers();
    expect(r.captures.length).toBe(1);
    expect(r.renders).toEqual([{ [KEY.on]: 0 }]);
    expect(store().getState().view?.rect).toEqual(r.view.rect);
    m.unmount();
    expect(store().getState().samples).toEqual({ input: null, output: null, view: null });
    r.develop.setState({ histogram: { v: 2 } });
    vi.runOnlyPendingTimers();
    expect(r.captures.length).toBe(1);
  });

  it("explains the graph and Adjust on image in tooltips, with no hint text of its own", () => {
    const r = rig();
    const m = keep(r.mount(EqualiserPanel, {}));
    expect(findAll(m.tree, (e) => e.type === "p")).toEqual([]);
    expect(findAll(m.tree, (e) => e.type === EqualiserGraph)).toHaveLength(1);
    const adjust = findAll(m.tree, (e) => e.type === Button && textOf(e) === "Adjust on image")[0];
    expect(adjust.props.title).toMatch(/Shift.*Alt/);
  });

  it("colours its sample label and option labels from the ui tokens", () => {
    const r = rig();
    r.settings.set("ring", "options");
    const options = keep(r.mount(EqualiserPanel, {}));
    expect(findAll(options.tree, (e) => e.type === "span").map((e) => (e.props.style as { color?: string }).color)).toEqual(["secondary-token"]);
    options.unmount();
    r.settings.delete("ring");
    const dock = keep(r.mount(EqualiserPanel, {}));
    const sample = findAll(dock.tree, (e) => e.type === "span")[0];
    expect((sample.props.style as { color?: string }).color).toBe("muted-token");
  });

  it("shows Pick as a kit Button with the picker icon, active while picking", () => {
    const r = rig();
    r.held.pickDrag = true;
    store().getState().setMode("pick");
    const m = keep(r.mount(EqualiserPanel, {}));
    const pick = findAll(m.tree, (e) => e.type === Button && textOf(e).trim() === "Pick")[0];
    expect(findAll(pick, (e) => e.type === PickerIcon)).toHaveLength(1);
    expect(pick.props.active).toBe(true);
  });

  it("ends Pick once core lets the pick-drag tool go (Esc, another picker), not while it holds it", () => {
    const r = rig();
    r.held.pickDrag = true;
    store().getState().setMode("pick");
    r.mount(EqualiserPanel, {});
    expect(store().getState().mode).toBe("pick");
    r.held.pickDrag = false;
    r.mount(EqualiserPanel, {});
    expect(store().getState().mode).toBeNull();
  });

  it("ends Adjust on image once core lets the canvas tool go (Esc, another tool)", () => {
    const r = rig();
    r.held.canvasTool = true;
    store().getState().setMode("adjust");
    r.mount(EqualiserPanel, {});
    expect(store().getState().mode).toBe("adjust");
    r.held.canvasTool = false;
    r.mount(EqualiserPanel, {});
    expect(store().getState().mode).toBeNull();
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

  it("leaves the photo's Pick alone though it holds no tool", () => {
    const r = rig({}, {});
    store().getState().setMode("pick");
    r.mount(EqualiserPanel, {});
    expect(store().getState().mode).toBe("pick");
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

  it("carries the how-to as the canvas's tooltip", () => {
    const r = rig();
    const m = keep(r.mount(EqualiserGraph, { ring: "shadows", channel: "saturation" }));
    expect(findAll(m.tree, (e) => e.type === "canvas")[0].props.title).toBe(GRAPH_HINT);
  });

  it("follows the active theme through the theme store, not the document's attributes", () => {
    const observer = vi.fn(function Observer() {
      return { observe: vi.fn(), disconnect: vi.fn() };
    });
    vi.stubGlobal("MutationObserver", observer);
    const r = rig();
    const subscribe = vi.spyOn(r.theme, "subscribe");
    const m = r.mount(EqualiserGraph, { ring: "shadows", channel: "saturation" });
    expect(observer).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(1);
    m.unmount();
  });

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
