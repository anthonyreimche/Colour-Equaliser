// The develop canvas's on-image tool: Ansel's on-image adjustment
// (mouse_moved / scrolled / button_pressed / gui_post_expose), armed from the
// panel. Hovering marks the hue on the active graph and draws Ansel's marker
// over the image — the input colour inside, the output colour outside, an arc
// for the curve's offset — the wheel shapes the active curve around that hue
// (Shift coarse, Alt fine; a Ctrl wheel, which a trackpad pinch also sends,
// stays the host's), and a right-click adds a node there. The colours come
// from captures of the view at its own pixels, read through the box the view
// showed them in, so they are the ones under the pointer at any zoom. The
// tool is zoomable, so core hands Ctrl / ⌘ / Space to pan and zoom, and ends
// it on Esc.

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  addNode,
  hueToCurveX,
  samplePeriodic,
  scrollCurve,
  type Channel,
  type CurveNode,
  type ScrollStep,
} from "./curve";
import { cursorOffset } from "./Graph";
import type { Params } from "./model";
import { deriveAll, readParams } from "./params";
import { readChannel, readRing } from "./Panel";
import { readingOf } from "./picker";
import type { Ring } from "./rings";
import { api, h } from "./runtime";
import type { CanvasTool, OverlayRect2 } from "./safelight";
import { displayCss, patchLinear, startLiveSampler } from "./sample";
import { store, type Cursor, type Samples } from "./store";

const COMMIT_DELAY_MS = 300;
/** Ansel's preview cursor radius. */
const OUTER_PX = 14;

/** An overlay point → UV across a box in the same layout px (the view's
 *  frame). Null outside the box. */
export function pointToUv(point: { x: number; y: number }, rect: OverlayRect2 | null): { x: number; y: number } | null {
  if (!rect || rect.w <= 0 || rect.h <= 0) return null;
  const x = (point.x - rect.x) / rect.w;
  const y = (point.y - rect.y) / rect.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** The curve the panel is showing. */
function activeCurve(): { ring: Ring; channel: Channel } {
  return { ring: readRing(), channel: readChannel() };
}

function withCurve(p: Params, ring: Ring, channel: Channel, nodes: readonly CurveNode[]): Params {
  return { ...p, curves: { ...p.curves, [ring]: { ...p.curves[ring], [channel]: nodes } } };
}

function stepOf(e: WheelEvent): ScrollStep {
  return e.shiftKey ? "coarse" : e.altKey ? "fine" : "normal";
}

/** The input and output colours under an overlay point, read from samples
 *  of the view through the box the view showed them in, with the input's dt
 *  UCS hue. Null off the view or without samples. */
export function readAt(samples: Samples, local: { x: number; y: number }): Omit<Cursor, "local"> | null {
  const { input, output, view } = samples;
  const uv = pointToUv(local, view);
  if (!input || !uv) return null;
  const inputRgb = patchLinear(input, uv.x, uv.y);
  if (!inputRgb) return null;
  const outputRgb = (output && patchLinear(output, uv.x, uv.y)) ?? inputRgb;
  const reading = readingOf(inputRgb);
  return reading && { hue: reading.hue, inputRgb, outputRgb };
}

export function EqualiserTool() {
  const { useEffect, useRef } = api().react;
  const dev = api().stores.useDevelopStore;
  const { rect: viewRect, nonce } = api().develop.useDevelopOverlay();
  const paramBag = dev((s) => s.paramBag);
  const mode = store()((s) => s.mode);
  const cursor = store()((s) => s.cursor);
  const ref = useRef<HTMLDivElement | null>(null);
  const commitTimer = useRef<number | null>(null);

  const commitLater = () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      void dev.getState().commitEdit("Colour Equaliser scroll");
    }, COMMIT_DELAY_MS);
  };
  useEffect(
    () => () => {
      if (commitTimer.current === null) return;
      window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
      void dev.getState().commitEdit("Colour Equaliser scroll");
    },
    [],
  );

  useEffect(() => store().getState().setView(viewRect && { rect: viewRect, nonce }), [viewRect, nonce]);
  useEffect(() => {
    const stop = startLiveSampler();
    return () => {
      stop();
      store().getState().setView(null);
      store().getState().setSamples({ input: null, output: null, view: null });
    };
  }, []);

  // The wheel is attached natively (non-passive) so the canvas does not zoom
  // underneath; React's onWheel cannot preventDefault.
  useEffect(() => {
    const el = ref.current;
    if (!el || mode !== "adjust") return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const c = store().getState().cursor;
      if (!c || e.deltaY === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const { ring, channel } = activeCurve();
      const p = readParams(dev.getState().paramBag);
      const next = scrollCurve(p.curves[ring][channel], channel, hueToCurveX(c.hue), e.deltaY < 0 ? 1 : -1, stepOf(e));
      dev.getState().setDynParams(deriveAll(withCurve(p, ring, channel, next)));
      commitLater();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mode]);

  if (mode !== "adjust") return null;

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const local = api().develop.framePoint(el, e.clientX, e.clientY);
    const s = readAt(store().getState().samples, local);
    store()
      .getState()
      .setCursor(s && { ...s, local });
  };

  const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const c = store().getState().cursor;
    if (!c) return;
    const { ring, channel } = activeCurve();
    const p = readParams(dev.getState().paramBag);
    const cur = p.curves[ring][channel];
    const x = hueToCurveX(c.hue);
    const added = addNode(cur, x, samplePeriodic(cur, x));
    if (!added) return;
    dev.getState().setDynParams(deriveAll(withCurve(p, ring, channel, added.nodes)));
    void dev.getState().commitEdit("Colour Equaliser add node");
  };

  const style = {
    position: "absolute",
    inset: 0,
    cursor: cursor ? "none" : api().cursors.resolve("crosshair"),
  } as const;

  let mark = null;
  if (cursor) {
    const { ring, channel } = activeCurve();
    mark = marker(cursor, cursorOffset(channel, readParams(paramBag).curves[ring][channel], cursor.hue));
  }

  return h(
    "div",
    {
      ref,
      style,
      onPointerMove,
      onContextMenu,
      onPointerLeave: () => store().getState().setCursor(null),
    },
    mark,
  );
}

const ADJUST_TOOL: CanvasTool = {
  overlay: EqualiserTool,
  zoomable: true,
  onEscape: () => store().getState().setMode(null),
};

/** Holds the canvas with the tool while Adjust on image is on, and lets it
 *  go when it ends. Returns the unsubscribe. */
export function holdAdjustTool(): () => void {
  return store().subscribe((state, prev) => {
    if ((state.mode === "adjust") !== (prev.mode === "adjust")) api().develop.setCanvasTool(state.mode === "adjust" ? ADJUST_TOOL : null);
  });
}

/** gui_post_expose's marker at the pointer: an intensity ring, the curve's
 *  offset as an arc from twelve o'clock, crosshair ticks, the output disc,
 *  the input disc. */
function marker(cursor: Cursor, offset: number) {
  const outer = OUTER_PX;
  const inner = outer * 0.55;
  const intensity = outer * 1.55;
  const gap = outer * 0.25;
  const extent = intensity + 5;
  const size = extent * 2 + 4;
  const c = size / 2;
  const outputCss = displayCss(cursor.outputRgb);
  const inputCss = displayCss(cursor.inputRgb);
  const sweep = 2 * Math.PI * Math.abs(offset);
  const end = -Math.PI / 2 + (offset > 0 ? sweep : -sweep);
  const arc =
    Math.abs(offset) > 1e-4
      ? h("path", {
          key: "arc",
          d: `M ${c} ${c - intensity} A ${intensity} ${intensity} 0 ${sweep > Math.PI ? 1 : 0} ${offset > 0 ? 1 : 0} ${c + intensity * Math.cos(end)} ${c + intensity * Math.sin(end)}`,
          fill: "none",
          stroke: outputCss,
          strokeWidth: 3,
        })
      : null;
  const tick = (x1: number, y1: number, x2: number, y2: number, key: string) =>
    h("line", { key, x1: c + x1, y1: c + y1, x2: c + x2, y2: c + y2, stroke: "rgba(255, 255, 255, 0.6)", strokeWidth: 1.25 });
  return h(
    "svg",
    {
      width: size,
      height: size,
      style: { position: "absolute", left: cursor.local.x - c, top: cursor.local.y - c, pointerEvents: "none", overflow: "visible" },
    },
    h("circle", { key: "intensity", cx: c, cy: c, r: intensity, fill: "none", stroke: "rgba(0, 0, 0, 0.35)", strokeWidth: 1.5 }),
    arc,
    tick(-extent, 0, -outer - gap, 0, "l"),
    tick(outer + gap, 0, extent, 0, "r"),
    tick(0, -extent, 0, -outer - gap, "t"),
    tick(0, outer + gap, 0, extent, "b"),
    h("circle", { key: "outer", cx: c, cy: c, r: outer, fill: outputCss, stroke: "rgba(0, 0, 0, 0.9)", strokeWidth: 1.25 }),
    h("circle", { key: "inner", cx: c, cy: c, r: inner, fill: inputCss, stroke: "rgba(255, 255, 255, 0.8)", strokeWidth: 1.25 }),
  );
}
