// Components rendered without React or a DOM. createElement builds a plain
// tree, state hooks hand back their initial value, and mount() attaches each
// element's ref to a stand-in node and then runs the effects, as React's
// commit would. A canvas draws into a context that records every call;
// stubDom() supplies the few browser globals the panel and graph reach for.

import { vi } from "vitest";
import type { SafelightAPI } from "../../src/safelight";

export interface Element {
  type: unknown;
  props: Record<string, unknown>;
  children: unknown[];
}

export interface Call {
  op: string;
  args: unknown[];
}

export interface FakeCanvas {
  width: number;
  height: number;
  readonly calls: Call[];
  getContext(kind: string): CanvasRenderingContext2D;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  setPointerCapture(id: number): void;
}

function recordingContext(calls: Call[]): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  return new Proxy(
    {},
    {
      get: (_target, op) =>
        (...args: unknown[]) => {
          calls.push({ op: String(op), args });
          return op === "createLinearGradient" ? gradient : undefined;
        },
      set: () => true,
    },
  ) as CanvasRenderingContext2D;
}

export function fakeCanvas(width = 0, height = 0): FakeCanvas {
  const calls: Call[] = [];
  const ctx = recordingContext(calls);
  return {
    width,
    height,
    calls,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    setPointerCapture: () => undefined,
  };
}

type Effect = () => void | (() => void);

export interface Mounted {
  tree: Element;
  /** Every canvas in the tree, in order. */
  canvases: FakeCanvas[];
  unmount(): void;
}

export interface Renderer {
  react: SafelightAPI["react"];
  mount<P>(component: (props: P) => unknown, props: P): Mounted;
}

function isElement(node: unknown): node is Element {
  return typeof node === "object" && node !== null && "type" in node && "children" in node;
}

/** Every element in a tree that `test` accepts, depth first. */
export function findAll(node: unknown, test: (el: Element) => boolean): Element[] {
  if (!isElement(node)) return [];
  return [...(test(node) ? [node] : []), ...node.children.flatMap((c) => findAll(c, test))];
}

/** The tree's text, children only. */
export function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return isElement(node) ? node.children.map(textOf).join(" ") : "";
}

export function renderer(): Renderer {
  let effects: Effect[] = [];
  const react = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element => ({
      type,
      props: props ?? {},
      children,
    }),
    useState: <T>(init: T | (() => T)) => [typeof init === "function" ? (init as () => T)() : init, () => undefined],
    useRef: <T>(current: T) => ({ current }),
    useEffect: (effect: Effect) => void effects.push(effect),
  } as unknown as SafelightAPI["react"];

  const mount = <P>(component: (props: P) => unknown, props: P): Mounted => {
    effects = [];
    const tree = component(props) as Element;
    const canvases: FakeCanvas[] = [];
    for (const el of findAll(tree, (e) => typeof e.props.ref === "object" && e.props.ref !== null)) {
      const style = (el.props.style ?? {}) as { width?: unknown; height?: unknown };
      const size = (v: unknown) => (typeof v === "number" ? v : 0);
      const node = el.type === "canvas" ? fakeCanvas(size(style.width), size(style.height)) : {};
      if (el.type === "canvas") canvases.push(node as FakeCanvas);
      (el.props.ref as { current: unknown }).current = node;
    }
    const cleanups = effects.map((effect) => effect()).filter((c): c is () => void => typeof c === "function");
    return { tree, canvases, unmount: () => cleanups.forEach((c) => c()) };
  };

  return { react, mount };
}

class InertObserver {
  observe(): void {}
  disconnect(): void {}
}

/** The browser globals the panel and graph touch, on a dark surface. */
export function stubDom(): void {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("getComputedStyle", () => ({ backgroundColor: "rgb(30, 30, 30)" }));
  vi.stubGlobal("document", { createElement: () => fakeCanvas(), documentElement: {}, body: {} });
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  vi.stubGlobal("ResizeObserver", InertObserver);
  vi.stubGlobal("MutationObserver", InertObserver);
}
