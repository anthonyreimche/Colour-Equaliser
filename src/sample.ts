// Live pixels for the picker and the on-image marker. Core recomputes the
// develop histogram after every settled render (throttled), so its identity
// changing is the "frame changed" signal; on each one the sampler takes two
// small captures — the photo rendered with this stage bypassed (what the
// stage receives) and the live view (what leaves it) — reads both back at
// ≤ SAMPLE_LONG_EDGE and publishes them. Captures are throttled and
// coalesced, one pair in flight, at most one queued, and stop with the
// photo. The panel starts the sampler while mounted, so a closed panel costs
// nothing.
//
// Both samples are display-referred; Ansel reads its own scene-linear pipe
// input and converts it for display. Hue survives the tone transform
// closely enough for the graph, and the brightness reading is a guide.

import { KEY } from "./params";
import { api } from "./runtime";
import type { DevelopParams, DevelopStoreState, StoreApi } from "./safelight";
import { store, type FrameSample, type Samples } from "./store";
import { linearToSrgb, srgbToLinear, type Vec3 } from "./ucs";

export const SAMPLE_LONG_EDGE = 320;
export const CAPTURE_THROTTLE_MS = 150;
/** Core's eyedropper patch. */
export const PATCH = 5;

const DECODE = new Float32Array(256);
for (let i = 0; i < 256; i++) DECODE[i] = srgbToLinear(i / 255);

let scratch: OffscreenCanvas | null = null;

/** Draw a captured frame at ≤ SAMPLE_LONG_EDGE and read it back; null for a
 *  blank (the host's "no renderer" 1×1 bitmap). */
export function readbackBitmap(bitmap: ImageBitmap): FrameSample | null {
  const { width: bw, height: bh } = bitmap;
  if (bw < 2 || bh < 2) return null;
  const scale = Math.min(1, SAMPLE_LONG_EDGE / Math.max(bw, bh));
  const w = Math.max(1, Math.round(bw * scale));
  const h = Math.max(1, Math.round(bh * scale));
  if (!scratch) scratch = new OffscreenCanvas(w, h);
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
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
  captureOutput(params: DevelopParams): Promise<ImageBitmap>;
  renderInput(photoId: string, params: DevelopParams, bag: Record<string, unknown>): Promise<ImageBitmap | null>;
  readback(bitmap: ImageBitmap): FrameSample | null;
  publish(samples: Samples): void;
  throttleMs?: number;
}

/** Follow the develop store and publish a fresh pair of samples per settled
 *  render. Returns the stop function. */
export function startSampler(deps: SamplerDeps): () => void {
  const throttle = deps.throttleMs ?? CAPTURE_THROTTLE_MS;
  let stopped = false;
  let inFlight = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastStart = -Infinity;

  const run = () => {
    timer = null;
    const state = deps.develop.getState();
    if (stopped || !state.photoId) return;
    inFlight = true;
    lastStart = Date.now();
    const params = state.previewParams ?? state.params;
    Promise.all([
      deps.captureOutput(params),
      deps.renderInput(state.photoId, params, { ...state.paramBag, [KEY.on]: 0 }),
    ])
      .then(([output, input]) => {
        const read = (b: ImageBitmap | null) => {
          const s = b && !stopped ? deps.readback(b) : null;
          b?.close?.();
          return s;
        };
        const samples: Samples = { output: read(output), input: read(input) };
        if (!stopped) deps.publish(samples);
      })
      .catch(() => {
        if (!stopped) deps.publish({ input: null, output: null });
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
      deps.publish({ input: null, output: null });
      return;
    }
    if (
      state.photoId &&
      (state.histogram !== prev.histogram || state.photoId !== prev.photoId || state.paramBag !== prev.paramBag)
    ) {
      request();
    }
  });

  request();

  return () => {
    stopped = true;
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

/** The production sampler over the live app. */
export function startLiveSampler(): () => void {
  const a = api();
  return startSampler({
    develop: a.stores.useDevelopStore,
    captureOutput: (params) => a.develop.captureFrame(params),
    renderInput: (photoId, params, bag) => a.develop.renderPhotoFrame(photoId, params, bag),
    readback: readbackBitmap,
    publish: (samples) => store().getState().setSamples(samples),
  });
}
