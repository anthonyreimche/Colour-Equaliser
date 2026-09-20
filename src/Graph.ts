// The curve graph of one ring and channel, Ansel's _draw_curve and its
// pointer callbacks: the ring's colours behind the curve, an 8×8 grid, the
// centre line, the hue axis strip, the picker and cursor lines, the curve at
// 360 samples, its nodes, and the cursor marker while adjusting on the image.
// Hover selects the node within 10 px; drag moves it, Ctrl+click adds one on
// the curve, right-click removes the selected one, double-click resets the
// curve. Drags write the bag live and commit on release; the rest commit at
// once.
//
// The plot sits on the panel's themed surface; canvas strokes cannot
// reference CSS variables, so the ink is derived from the resolved surface
// and flips brightness against it.

import type { CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import {
  addNode,
  channelValue,
  defaultCurve,
  hueToCurveX,
  moveNode,
  normaliseNodes,
  removeNode,
  samplePeriodic,
  type Channel,
  type CurveNode,
} from "./curve";
import {
  AXIS_HEIGHT,
  GRAPH_RES,
  INSET,
  axisStops,
  backgroundImage,
  nearestNode,
  plotGeometry,
  toPlot,
  type PlotGeometry,
} from "./graph-model";
import { deriveAll, readParams } from "./params";
import type { Ring } from "./rings";
import { api, h } from "./runtime";
import { displayCss } from "./sample";
import { store } from "./store";

const FRAME_WIDTH = 240;

interface Ink {
  fg: string;
  faint: string;
  bg: string;
}

function inkFor(canvas: HTMLCanvasElement): Ink {
  const m = getComputedStyle(canvas).backgroundColor.match(/\d+(?:\.\d+)?/g);
  const dark = m ? (Number(m[0]) + Number(m[1]) + Number(m[2])) / (3 * 255) < 0.5 : true;
  return dark
    ? { fg: "rgba(235, 235, 235, 0.92)", faint: "rgba(235, 235, 235, 0.28)", bg: "rgba(20, 20, 20, 0.9)" }
    : { fg: "rgba(25, 25, 25, 0.9)", faint: "rgba(25, 25, 25, 0.28)", bg: "rgba(245, 245, 245, 0.9)" };
}

const backgroundCanvases = new Map<string, HTMLCanvasElement>();

function backgroundCanvas(ring: Ring, channel: Channel): HTMLCanvasElement {
  const key = `${ring}/${channel}`;
  const cached = backgroundCanvases.get(key);
  if (cached) return cached;
  const image = backgroundImage(ring, channel);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  backgroundCanvases.set(key, canvas);
  return canvas;
}

interface DrawState {
  ring: Ring;
  channel: Channel;
  nodes: readonly CurveNode[];
  selected: number;
  pickerHue: number | null;
  cursor: { hue: number; inputCss: string; outputCss: string; offset: number } | null;
}

function drawGraph(ctx: CanvasRenderingContext2D, g: PlotGeometry, ink: Ink, s: DrawState): void {
  const { plotW, plotH } = g;
  const cx = (x: number) => INSET + x * plotW;
  const cy = (y: number) => INSET + (1 - y) * plotH;
  ctx.clearRect(0, 0, g.width, g.height);

  ctx.drawImage(backgroundCanvas(s.ring, s.channel), INSET, INSET, plotW, plotH);

  ctx.lineWidth = 0.5;
  ctx.strokeStyle = ink.faint;
  for (let k = 1; k < 8; k++) {
    ctx.beginPath();
    ctx.moveTo(cx(k / 8), INSET);
    ctx.lineTo(cx(k / 8), INSET + plotH);
    ctx.moveTo(INSET, INSET + (k / 8) * plotH);
    ctx.lineTo(INSET + plotW, INSET + (k / 8) * plotH);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = ink.fg;
  ctx.beginPath();
  ctx.moveTo(INSET, cy(0.5));
  ctx.lineTo(INSET + plotW, cy(0.5));
  ctx.stroke();

  const axis = ctx.createLinearGradient(INSET, 0, INSET + plotW, 0);
  for (const stop of axisStops(s.ring, s.channel)) axis.addColorStop(stop.at, stop.css);
  ctx.fillStyle = axis;
  ctx.fillRect(INSET, INSET + plotH, plotW, AXIS_HEIGHT);

  const fullHeight = plotH + AXIS_HEIGHT;
  if (s.pickerHue !== null) {
    const x = cx(hueToCurveX(s.pickerHue));
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink.fg;
    ctx.beginPath();
    ctx.moveTo(x, INSET);
    ctx.lineTo(x, INSET + fullHeight);
    ctx.stroke();
  }
  if (s.cursor) {
    const x = cx(hueToCurveX(s.cursor.hue));
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
    ctx.beginPath();
    ctx.moveTo(x, INSET);
    ctx.lineTo(x, INSET + fullHeight);
    ctx.stroke();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = s.cursor.outputCss;
    ctx.beginPath();
    ctx.moveTo(x, INSET);
    ctx.lineTo(x, INSET + fullHeight);
    ctx.stroke();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(INSET, INSET, plotW, plotH);
  ctx.clip();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ink.fg;
  ctx.beginPath();
  for (let k = 0; k < GRAPH_RES; k++) {
    const x = k / (GRAPH_RES - 1);
    const y = samplePeriodic(s.nodes, x);
    if (k === 0) ctx.moveTo(cx(x), cy(y));
    else ctx.lineTo(cx(x), cy(y));
  }
  ctx.stroke();
  s.nodes.forEach((n, k) => {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx(n.x - Math.floor(n.x)), cy(n.y), k === s.selected ? 5 : 4, 0, 2 * Math.PI);
    ctx.strokeStyle = ink.fg;
    ctx.stroke();
    ctx.fillStyle = ink.bg;
    ctx.fill();
  });
  if (s.cursor) {
    const x = hueToCurveX(s.cursor.hue);
    const mx = cx(x);
    const my = cy(samplePeriodic(s.nodes, x));
    const outer = 7;
    const inner = 4;
    const intensity = 11;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.arc(mx, my, intensity, 0, 2 * Math.PI);
    ctx.stroke();
    if (Math.abs(s.cursor.offset) > 1e-4) {
      ctx.lineWidth = 2.25;
      ctx.strokeStyle = s.cursor.outputCss;
      ctx.beginPath();
      const sweep = 2 * Math.PI * Math.abs(s.cursor.offset);
      ctx.arc(mx, my, intensity, -Math.PI / 2, -Math.PI / 2 + (s.cursor.offset > 0 ? sweep : -sweep), s.cursor.offset < 0);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(mx, my, outer, 0, 2 * Math.PI);
    ctx.fillStyle = s.cursor.outputCss;
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx, my, inner, 0, 2 * Math.PI);
    ctx.fillStyle = s.cursor.inputCss;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.stroke();
  }
  ctx.restore();
}

/** _cursor_curve_state's offset: the curve's value at the cursor hue as a
 *  fraction of its range, for the marker's arc. */
export function cursorOffset(channel: Channel, nodes: readonly CurveNode[], hue: number): number {
  const value = channelValue(channel, samplePeriodic(nodes, hueToCurveX(hue)));
  const offset = channel === "hue" ? value / Math.PI : value - 1;
  return offset < -1 ? -1 : offset > 1 ? 1 : offset;
}

interface Drag {
  node: number;
  moved: boolean;
}

export interface GraphProps {
  ring: Ring;
  channel: Channel;
}

export function EqualiserGraph({ ring, channel }: GraphProps) {
  const { useEffect, useRef, useState } = api().react;
  const dev = api().stores.useDevelopStore;
  const paramBag = dev((s) => s.paramBag);
  const cursor = store()((s) => s.cursor);
  const picker = store()((s) => s.picker);
  const nodes = readParams(paramBag).curves[ring][channel];

  const [width, setWidth] = useState(FRAME_WIDTH);
  const [selected, setSelected] = useState(-1);
  const [epoch, setEpoch] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const g = plotGeometry(width);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 40) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Theme swaps restyle the root's CSS variables in place; watch the root so
  // the ink re-derives without waiting for the next interaction.
  useEffect(() => {
    const bump = () => setEpoch((e) => e + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true });
    mo.observe(document.body, { attributes: true });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(g.width * dpr);
    canvas.height = Math.round(g.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGraph(ctx, g, inkFor(canvas), {
      ring,
      channel,
      nodes,
      selected,
      pickerHue: picker?.hue ?? null,
      cursor: cursor
        ? {
            hue: cursor.hue,
            inputCss: displayCss(cursor.inputRgb),
            outputCss: displayCss(cursor.outputRgb),
            offset: cursorOffset(channel, nodes, cursor.hue),
          }
        : null,
    });
  }, [paramBag, ring, channel, selected, width, cursor, picker, epoch]);

  const live = () => readParams(dev.getState().paramBag);
  const write = (next: readonly CurveNode[]) => {
    const p = live();
    dev.getState().setDynParams(
      deriveAll({ ...p, curves: { ...p.curves, [ring]: { ...p.curves[ring], [channel]: next } } }),
    );
  };
  const commit = (what: string) => void dev.getState().commitEdit(`Colour Equaliser ${what}`);

  const canvasPoint = (e: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { px: ((e.clientX - r.left) * g.width) / r.width, py: ((e.clientY - r.top) * g.height) / r.height };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { px, py } = canvasPoint(e);
    const cur = live().curves[ring][channel];
    if (e.ctrlKey || e.metaKey) {
      const { x } = toPlot(g, px, py);
      const added = addNode(cur, x, samplePeriodic(cur, x));
      if (added) {
        write(added.nodes);
        setSelected(added.index);
        commit("add node");
      }
      return;
    }
    const k = nearestNode(cur, g, px, py);
    setSelected(k);
    if (k >= 0) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { node: k, moved: false };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { px, py } = canvasPoint(e);
    const cur = live().curves[ring][channel];
    const drag = dragRef.current;
    if (drag) {
      const { x, y } = toPlot(g, px, py);
      const next = moveNode(cur, drag.node, x, y);
      if (next) {
        // The bag keeps nodes sorted, so a node dragged past the wrap
        // changes index; follow it.
        const moved = next[drag.node];
        drag.node = normaliseNodes(next).findIndex((n) => n.x === moved.x - Math.floor(moved.x) && n.y === moved.y);
        drag.moved = true;
        write(next);
        setSelected(drag.node);
      }
      return;
    }
    setSelected(nearestNode(cur, g, px, py));
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) commit("curve");
  };

  const onContextMenu = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cur = live().curves[ring][channel];
    const next = removeNode(cur, selected);
    if (!next) return;
    write(next);
    setSelected(-1);
    commit("remove node");
  };

  const onDoubleClick = () => {
    write(defaultCurve());
    setSelected(-1);
    commit("reset curve");
  };

  const style: CSSProperties = {
    width: g.width,
    height: g.height,
    display: "block",
    touchAction: "none",
    borderRadius: 4,
    background: api().ui.tokens.surface0,
    cursor: "crosshair",
  };

  return h(
    "div",
    { ref: wrapRef, style: { width: "100%" } },
    h("canvas", {
      ref: canvasRef,
      style,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerLeave: () => {
        if (!dragRef.current) setSelected(-1);
      },
      onContextMenu,
      onDoubleClick,
    }),
  );
}
