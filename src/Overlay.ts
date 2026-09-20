// The develop-canvas overlay: Ansel's colour picker and its on-image
// adjustment (mouse_moved / scrolled / button_pressed / gui_post_expose),
// armed from the panel. While picking, a left click marks the sampled hue
// on every graph and reports its brightness. While adjusting, hovering marks
// the hue on the active graph and draws Ansel's marker over the image — the
// input colour inside, the output colour outside, an arc for the curve's
// offset — the wheel shapes the active curve around that hue (Shift coarse,
// Alt fine; Ctrl stays the host's), and a right-click adds a node there.
// Ctrl / ⌘ / Space go click-through so pan and zoom keep working; Esc ends
// either mode.

import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  addNode,
  hueToCurveX,
  samplePeriodic,
  scrollCurve,
  wrapHuePi,
  type Channel,
  type CurveNode,
  type ScrollStep,
} from "./curve";
import { cursorOffset } from "./Graph";
import type { Params } from "./model";
import { deriveAll, readParams } from "./params";
import { readChannel, readPage } from "./Panel";
import type { Ring } from "./rings";
import { api, h } from "./runtime";
import type { OverlayRect } from "./safelight";
import { displayCss, patchLinear } from "./sample";
import { store, type Cursor } from "./store";
import { linearSrgbToHsb } from "./ucs";

const COMMIT_DELAY_MS = 300;
/** Ansel's preview cursor radius. */
const OUTER_PX = 14;

export interface ClientBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Client point → image UV through the displayed image rect. `clientWidth /
 *  box.width` is the interface scale (the body zoom), so a zoomed UI still
 *  lands on the pixel under the pointer. Null outside the image. */
export function pointToUv(
  clientX: number,
  clientY: number,
  box: ClientBox,
  clientWidth: number,
  rect: OverlayRect | null,
): { x: number; y: number } | null {
  if (!rect || box.width <= 0 || box.height <= 0 || rect.w <= 0 || rect.h <= 0) return null;
  const scale = clientWidth / box.width;
  const x = ((clientX - box.left) * scale - rect.x) / rect.w;
  const y = ((clientY - box.top) * scale - rect.y) / rect.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** The curve the panel is showing; the options page keeps the last ring's
 *  midtones so the wheel still has a target. */
function activeCurve(): { ring: Ring; channel: Channel } {
  const page = readPage();
  return { ring: page === "options" ? "midtones" : page, channel: readChannel() };
}

function withCurve(p: Params, ring: Ring, channel: Channel, nodes: readonly CurveNode[]): Params {
  return { ...p, curves: { ...p.curves, [ring]: { ...p.curves[ring], [channel]: nodes } } };
}

function stepOf(e: WheelEvent): ScrollStep {
  return e.shiftKey ? "coarse" : e.altKey ? "fine" : "normal";
}

interface Sampled {
  hue: number;
  brightness: number;
  inputRgb: Cursor["inputRgb"];
  outputRgb: Cursor["outputRgb"];
}

/** The input and output colours at image point (u, v) from the latest
 *  samples, with the input's dt UCS hue and brightness. */
function sampleAt(uv: { x: number; y: number }): Sampled | null {
  const { input, output } = store().getState().samples;
  if (!input) return null;
  const inputRgb = patchLinear(input, uv.x, uv.y);
  if (!inputRgb) return null;
  const outputRgb = (output && patchLinear(output, uv.x, uv.y)) ?? inputRgb;
  const hsb = linearSrgbToHsb(inputRgb);
  if (!Number.isFinite(hsb[0])) return null;
  return { hue: wrapHuePi(hsb[0]), brightness: hsb[2] < 0 ? 0 : hsb[2] > 1 ? 1 : hsb[2], inputRgb, outputRgb };
}

export function EqualiserOverlay() {
  const { useEffect, useRef, useState } = api().react;
  const dev = api().stores.useDevelopStore;
  const paramBag = dev((s) => s.paramBag);
  const mode = store()((s) => s.mode);
  const cursor = store()((s) => s.cursor);
  const overlay = api().develop.useDevelopOverlay();
  const ref = useRef<HTMLDivElement | null>(null);
  const [passthrough, setPassthrough] = useState(false);
  const commitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (mode === null) return;
    const held = new Set<string>();
    const update = () => setPassthrough(held.has("Control") || held.has("Meta") || held.has(" "));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        store().getState().setMode(null);
        return;
      }
      held.add(e.key);
      update();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(e.key);
      update();
    };
    const onBlur = () => {
      held.clear();
      update();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setPassthrough(false);
    };
  }, [mode]);

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

  if (mode === null) return null;

  /** The pointer in the overlay's own layout px and, through the image
   *  rect, in image UV. */
  const locate = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const scale = box.width > 0 ? el.clientWidth / box.width : 1;
    return {
      local: { x: (clientX - box.left) * scale, y: (clientY - box.top) * scale },
      uv: pointToUv(clientX, clientY, box, el.clientWidth, overlay.rect),
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== "adjust") return;
    const at = locate(e.clientX, e.clientY);
    const s = at?.uv && sampleAt(at.uv);
    store()
      .getState()
      .setCursor(at && s ? { hue: s.hue, inputRgb: s.inputRgb, outputRgb: s.outputRgb, local: at.local } : null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || mode !== "pick") return;
    e.preventDefault();
    const at = locate(e.clientX, e.clientY);
    const s = at?.uv && sampleAt(at.uv);
    if (!s) return;
    store().getState().setPicker({ hue: s.hue, brightness: s.brightness });
    store().getState().setMode(null);
  };

  const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (mode !== "adjust") return;
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

  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: passthrough ? "none" : "auto",
    cursor: mode === "pick" ? api().cursors.resolve("pick") : cursor ? "none" : "crosshair",
  };

  let mark = null;
  if (mode === "adjust" && cursor) {
    const { ring, channel } = activeCurve();
    mark = marker(cursor, cursorOffset(channel, readParams(paramBag).curves[ring][channel], cursor.hue));
  }

  return h(
    "div",
    {
      ref,
      style,
      onPointerMove,
      onPointerDown,
      onContextMenu,
      onPointerLeave: () => store().getState().setCursor(null),
    },
    mark,
  );
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
