// Live pixels for the on-image marker. Core recomputes the
// develop histogram after every settled render (throttled), so its identity
// changing is the "frame changed" signal, and the view's nonce changing (a
// zoom, pan or resize) is the other; on each the sampler takes two captures
// of the view — with this stage bypassed (what the stage receives) and as it
// is (what leaves it) — reads both back at the frame's own pixels, so the
// pointer reads what it is over at any zoom, and publishes them with the box
// the frame sat in. Captures are throttled and coalesced, one pair in
// flight, at most one queued, and stop with the photo. Adjust on image runs
// the sampler while it is on, so it costs nothing otherwise.
//
// Both samples are display-referred; Ansel reads its own scene-linear pipe
// input and converts it for display. Hue survives the tone transform
// closely enough for the graph, and the brightness reading is a guide.

import { KEY } from "./params";
import { api } from "./runtime";
import type { DevelopParams, DevelopStoreState, StoreApi } from "./safelight";
import { store, type FrameSample, type SampledView, type Samples } from "./store";
import { linearToSrgb, srgbToLinear, type Vec3 } from "./ucs";

/** How long after a capture that failed or came back blank (the photo still
 *  loading, a stage still making what it needs) the sampler tries again. */
export const RETRY_MS = 1000;
export const CAPTURE_THROTTLE_MS = 150;
/** Core's eyedropper patch. */
export const PATCH = 5;

const DECODE = new Float32Array(256);
for (let i = 0; i < 256; i++) DECODE[i] = srgbToLinear(i / 255);

let scratch: OffscreenCanvas | null = null;

/** Read a captured frame back at its own pixels; null for a blank (the
 *  host's "no renderer" 1×1 bitmap). */
export function readbackBitmap(bitmap: ImageBitmap): FrameSample | null {
  const { width: w, height: h } = bitmap;
  if (w < 2 || h < 2) return null;
  if (!scratch) scratch = new OffscreenCanvas(w, h);
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

/** The PATCH×PATCH box around image point (u, v) averaged in linear light;
 *  null outside the image. */
export function patchLinear(sample: FrameSample, u: number, v: number): Vec3 | null {
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const { data, width, height } = sample;
  const px = Math.min(width - 1, Math.floor(u * width));
  const py = Math.min(height - 1, Math.floor(v * height));
  const half = PATCH >> 1;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.max(0, py - half); y <= Math.min(height - 1, py + half); y++) {
    for (let x = Math.max(0, px - half); x <= Math.min(width - 1, px + half); x++) {
      const o = (y * width + x) * 4;
      r += DECODE[data[o]];
      g += DECODE[data[o + 1]];
      b += DECODE[data[o + 2]];
      n++;
    }
  }
  return n === 0 ? null : [r / n, g / n, b / n];
}

/** A linear colour as a CSS colour through the sRGB curve. */
export function displayCss(rgb: Vec3): string {
  const enc = (v: number) => Math.round(linearToSrgb(v < 0 ? 0 : v > 1 ? 1 : v) * 255);
  return `rgb(${enc(rgb[0])}, ${enc(rgb[1])}, ${enc(rgb[2])})`;
}

/** _format_picker_brightness_position: where a dt UCS brightness sits
 *  between the rings, so the reading says which graphs will move it most. */
export function brightnessLabel(brightness: number): string {
  const pct = (t: number) => Math.min(100, Math.max(0, Math.round((1 - t) * 100)));
  if (brightness <= 0.15) return "100% shadows";
  if (brightness < 0.45) {
    const shadows = pct((brightness - 0.15) / 0.3);
    return `${shadows}% shadows, ${100 - shadows}% midtones`;
  }
  if (brightness < 0.75) {
    const midtones = pct((brightness - 0.45) / 0.3);
    return `${midtones}% midtones, ${100 - midtones}% highlights`;
  }
  return "100% highlights";
}

export interface SamplerDeps {
  develop: StoreApi<DevelopStoreState>;
  /** Where the view's frame sits; null before its first layout. */
  view: StoreApi<{ view: SampledView | null }>;
  /** A frame of the view (captureFrame), with `bag` over the photo's. */
  capture(params: DevelopParams, bag?: Record<string, unknown>): Promise<ImageBitmap>;
  readback(bitmap: ImageBitmap): FrameSample | null;
  publish(samples: Samples): void;
  throttleMs?: number;
}

/** Follow the develop store and the view and publish a fresh pair of samples
 *  per settled render or view change. Returns the stop function. */
export function startSampler(deps: SamplerDeps): () => void {
  const throttle = deps.throttleMs ?? CAPTURE_THROTTLE_MS;
  let stopped = false;
  let inFlight = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let lastStart = -Infinity;

  // Nothing else may change for a while after a failed capture (no render
  // settles, the view stays put), so the sampler asks again itself.
  const retryLater = () => {
    if (retry !== null || stopped) return;
    retry = setTimeout(() => {
      retry = null;
      request();
    }, RETRY_MS);
  };

  const run = () => {
    timer = null;
    const state = deps.develop.getState();
    const view = deps.view.getState().view;
    if (stopped || !state.photoId || !view) return;
    inFlight = true;
    lastStart = Date.now();
    const params = state.previewParams ?? state.params;
    Promise.allSettled([deps.capture(params), deps.capture(params, { [KEY.on]: 0 })])
      .then(([outputCapture, inputCapture]) => {
        const read = (capture: PromiseSettledResult<ImageBitmap>) => {
          if (capture.status === "rejected") return null;
          const s = stopped ? null : deps.readback(capture.value);
          capture.value.close?.();
          return s;
        };
        const output = read(outputCapture);
        const input = read(inputCapture);
        if (stopped) return;
        if (output && input) {
          deps.publish({ output, input, view: view.rect });
          return;
        }
        deps.publish({ input: null, output: null, view: null });
        retryLater();
      })
      .finally(() => {
        inFlight = false;
        if (queued && !stopped) {
          queued = false;
          request();
        }
      });
  };

  const request = () => {
    if (stopped) return;
    if (inFlight) {
      queued = true;
      return;
    }
    if (timer !== null) return;
    timer = setTimeout(run, Math.max(0, throttle - (Date.now() - lastStart)));
  };

  const unsubscribe = deps.develop.subscribe((state, prev) => {
    if (state.photoId !== prev.photoId && !state.photoId) {
      queued = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      deps.publish({ input: null, output: null, view: null });
      return;
    }
    if (
      state.photoId &&
      (state.histogram !== prev.histogram || state.photoId !== prev.photoId || state.paramBag !== prev.paramBag)
    ) {
      request();
    }
  });

  const unsubscribeView = deps.view.subscribe((state, prev) => {
    if (state.view !== prev.view && state.view) request();
  });

  request();

  return () => {
    stopped = true;
    unsubscribe();
    unsubscribeView();
    if (timer !== null) clearTimeout(timer);
    if (retry !== null) clearTimeout(retry);
    timer = null;
    retry = null;
  };
}

/** The production sampler over the live app. */
export function startLiveSampler(): () => void {
  const a = api();
  return startSampler({
    develop: a.stores.useDevelopStore,
    view: store(),
    capture: (params, bag) => a.develop.captureFrame(params, bag && { paramBag: bag }),
    readback: readbackBitmap,
    publish: (samples) => store().getState().setSamples(samples),
  });
}
