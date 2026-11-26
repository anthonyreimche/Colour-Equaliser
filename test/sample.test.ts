// The frame sampler and what the panel reads from a sample: Ansel's picker
// label for a brightness between the rings, the 5×5 patch in linear light,
// and the scheduling of the two captures of the view (the input, with this
// stage bypassed, and the output), each pair tagged with the view it shows.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEY } from "../src/params";
import { brightnessLabel, displayCss, patchLinear, RETRY_MS, startSampler, type SamplerDeps } from "../src/sample";
import type { FrameSample, Samples, SampledView } from "../src/store";
import type { DevelopParams, DevelopStoreState, StateCreator, StoreApi } from "../src/safelight";
import { linearToSrgb } from "../src/ucs";

function fakeStore<T extends object>(init: StateCreator<T> | T): StoreApi<T> {
  let state: T;
  const listeners = new Set<(s: T, prev: T) => void>();
  const set = (partial: Partial<T> | ((s: T) => Partial<T>)) => {
    const prev = state;
    state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
    for (const l of listeners) l(state, prev);
  };
  const get = () => state;
  state = typeof init === "function" ? (init as StateCreator<T>)(set, get) : init;
  const hook = ((selector?: (s: T) => unknown) => (selector ? selector(state) : state)) as StoreApi<T>;
  hook.getState = get;
  hook.setState = set;
  hook.subscribe = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return hook;
}

describe("brightnessLabel", () => {
  it("reads where a brightness sits between Ansel's rings", () => {
    expect(brightnessLabel(0.1)).toBe("100% shadows");
    expect(brightnessLabel(0.15)).toBe("100% shadows");
    expect(brightnessLabel(0.3)).toBe("50% shadows, 50% midtones");
    expect(brightnessLabel(0.45)).toBe("100% midtones, 0% highlights");
    expect(brightnessLabel(0.6)).toBe("50% midtones, 50% highlights");
    expect(brightnessLabel(0.75)).toBe("100% highlights");
    expect(brightnessLabel(0.9)).toBe("100% highlights");
  });
});

describe("patchLinear", () => {
  const frame = (): FrameSample => {
    const data = new Uint8ClampedArray(9 * 9 * 4);
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const o = (y * 9 + x) * 4;
        data[o] = x < 4 ? 0 : 255;
        data[o + 1] = 128;
        data[o + 2] = 0;
        data[o + 3] = 255;
      }
    }
    return { data, width: 9, height: 9 };
  };

  it("averages the box in linear light and clamps at the edges", () => {
    const centre = patchLinear(frame(), 0.5, 0.5)!;
    expect(centre[0]).toBeCloseTo(3 / 5, 12);
    expect(centre[1]).toBeCloseTo(Math.pow((128 / 255 + 0.055) / 1.055, 2.4), 6);
    expect(centre[2]).toBe(0);
    const corner = patchLinear(frame(), 0, 0)!;
    expect(corner[0]).toBe(0);
    expect(patchLinear(frame(), 1, 1)![0]).toBe(1);
    expect(patchLinear(frame(), 1.2, 0.5)).toBeNull();
  });

  it("formats a linear colour for CSS through the sRGB curve", () => {
    expect(displayCss([0, 1, 0.5])).toBe(`rgb(0, 255, ${Math.round(linearToSrgb(0.5) * 255)})`);
    expect(displayCss([-0.2, 1.4, 0.2])).toBe(`rgb(0, 255, ${Math.round(linearToSrgb(0.2) * 255)})`);
  });
});

describe("startSampler", () => {
  const bitmap = (w: number) => ({ width: w, height: w, close: () => undefined }) as unknown as ImageBitmap;
  const read = (b: ImageBitmap): FrameSample | null =>
    b.width < 2 ? null : { data: new Uint8ClampedArray(b.width * b.height * 4), width: b.width, height: b.height };
  const VIEW: SampledView = { rect: { x: 10, y: 20, w: 300, h: 200 }, nonce: 1 };

  interface Rig {
    develop: StoreApi<DevelopStoreState>;
    view: StoreApi<{ view: SampledView | null }>;
    published: Samples[];
    inputBags: Record<string, unknown>[];
    captures: number;
    /** Captures to fail, or to come back blank, before they work. */
    failures: number;
    blanks: number;
    stop: () => void;
  }

  function rig(view: SampledView | null = VIEW, throttleMs = 150): Rig {
    const develop = fakeStore<DevelopStoreState>({
      photoId: "p1",
      params: {} as DevelopParams,
      previewParams: null,
      paramBag: { [KEY.on]: 1, [KEY.whiteLevel]: 1 },
      histogram: { v: 1 },
    } as Partial<DevelopStoreState> as DevelopStoreState);
    const r: Rig = { develop, view: fakeStore({ view }), published: [], inputBags: [], captures: 0, failures: 0, blanks: 0, stop: () => undefined };
    const deps: SamplerDeps = {
      develop,
      view: r.view,
      capture: async (_params, bag) => {
        if (bag) r.inputBags.push(bag);
        else r.captures++;
        if (!bag && r.failures > 0) {
          r.failures--;
          throw new Error("the photo isn't ready");
        }
        if (!bag && r.blanks > 0) {
          r.blanks--;
          return bitmap(1);
        }
        return bitmap(8);
      },
      readback: read,
      publish: (s) => r.published.push(s),
      throttleMs,
    };
    r.stop = startSampler(deps);
    return r;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("captures the view once on start, the input with only this stage bypassed, and again per settled render", async () => {
    const r = rig();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.published.length).toBe(1);
    expect(r.published[0].input?.width).toBe(8);
    expect(r.published[0].output?.width).toBe(8);
    expect(r.captures).toBe(1);
    expect(r.inputBags[0]).toEqual({ [KEY.on]: 0 });
    r.develop.setState({ histogram: { v: 2 } });
    r.develop.setState({ histogram: { v: 3 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(r.published.length).toBe(2);
    r.develop.setState({ paramBag: { [KEY.on]: 1, [KEY.whiteLevel]: 2 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(r.published.length).toBe(3);
    r.stop();
  });

  it("tags each pair with the view it was captured in, and captures again when the view moves", async () => {
    const r = rig();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.published[0].view).toEqual(VIEW.rect);
    const panned: SampledView = { rect: VIEW.rect, nonce: 2 };
    r.view.setState({ view: panned });
    await vi.advanceTimersByTimeAsync(200);
    expect(r.published.length).toBe(2);
    const zoomed: SampledView = { rect: { x: -400, y: -300, w: 1200, h: 800 }, nonce: 3 };
    r.view.setState({ view: zoomed });
    await vi.advanceTimersByTimeAsync(200);
    expect(r.published[r.published.length - 1].view).toEqual(zoomed.rect);
    r.stop();
  });

  it("waits for the view to lay out before its first capture", async () => {
    const r = rig(null);
    await vi.advanceTimersByTimeAsync(500);
    expect(r.published).toEqual([]);
    expect(r.captures).toBe(0);
    r.view.setState({ view: VIEW });
    await vi.advanceTimersByTimeAsync(200);
    expect(r.published.length).toBe(1);
    expect(r.published[0].view).toEqual(VIEW.rect);
    r.stop();
  });

  it("tries again a second later after a capture fails or comes back blank, with nothing else changing", async () => {
    const r = rig();
    r.failures = 1;
    r.blanks = 1;
    await vi.advanceTimersByTimeAsync(0);
    expect(r.published).toEqual([{ input: null, output: null, view: null }]);
    await vi.advanceTimersByTimeAsync(RETRY_MS + 200);
    expect(r.captures).toBe(2);
    expect(r.published[1].output).toBeNull();
    await vi.advanceTimersByTimeAsync(RETRY_MS + 200);
    expect(r.captures).toBe(3);
    expect(r.published[2].output?.width).toBe(8);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 5);
    expect(r.captures).toBe(3);
    r.stop();
  });

  it("stops trying again once stopped", async () => {
    const r = rig();
    r.failures = 5;
    await vi.advanceTimersByTimeAsync(0);
    r.stop();
    await vi.advanceTimersByTimeAsync(RETRY_MS * 5);
    expect(r.captures).toBe(1);
  });

  it("publishes empty samples when the photo closes and nothing after stop", async () => {
    const r = rig();
    await vi.advanceTimersByTimeAsync(0);
    r.develop.setState({ photoId: null });
    expect(r.published[r.published.length - 1]).toEqual({ input: null, output: null, view: null });
    const n = r.published.length;
    r.stop();
    r.develop.setState({ photoId: "p2", histogram: { v: 9 } });
    r.view.setState({ view: { rect: VIEW.rect, nonce: 5 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(r.published.length).toBe(n);
  });
});
