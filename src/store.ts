// Session state shared by the panel, the graph and the overlay: the mode the
// overlay is armed for, the view Adjust on image sees and the latest samples
// of it, the cursor the graph marks
// while adjusting on the image, and the picker's reading. Built on the host's
// zustand `create` so the components subscribe like core.

import { api } from "./runtime";
import type { OverlayRect2, StoreApi } from "./safelight";
import type { Vec3 } from "./ucs";

/** What the develop-canvas overlay is doing: picking a hue for the graphs,
 *  adjusting the active curve from the image, or nothing. */
export type Mode = "pick" | "adjust" | null;

/** An 8-bit sRGB readback of a rendered frame. */
export interface FrameSample {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Where the view's frame sits in the overlay's layout px (the visible
 *  window when zoomed), and a count that changes with every zoom, pan or
 *  resize, since a pan can leave the box where it was. */
export interface SampledView {
  rect: OverlayRect2;
  nonce: number;
}

/** The view's frame as this stage receives it (this stage bypassed) and as
 *  the pipeline leaves it, at the frame's own pixels, with the box the frame
 *  sat in when they were captured. */
export interface Samples {
  input: FrameSample | null;
  output: FrameSample | null;
  view: OverlayRect2 | null;
}

/** The colour under the pointer while adjusting on the image. */
export interface Cursor {
  /** dt UCS hue, radians in (−π, π]. */
  hue: number;
  /** Linear sRGB, display-referred. */
  inputRgb: Vec3;
  outputRgb: Vec3;
  /** The pointer in the overlay's own layout px. */
  local: { x: number; y: number };
}

export interface Picker {
  hue: number;
  brightness: number;
}

export interface UiState {
  mode: Mode;
  view: SampledView | null;
  samples: Samples;
  cursor: Cursor | null;
  picker: Picker | null;
  setMode(mode: Mode): void;
  setView(view: SampledView | null): void;
  setSamples(samples: Samples): void;
  setCursor(cursor: Cursor | null): void;
  setPicker(picker: Picker | null): void;
}

let current: StoreApi<UiState> | null = null;

export function initStore(): void {
  current = api().stores.create<UiState>((set) => ({
    mode: null,
    view: null,
    samples: { input: null, output: null, view: null },
    cursor: null,
    picker: null,
    setMode: (mode) => set({ mode, cursor: null }),
    setView: (view) => set({ view }),
    setSamples: (samples) => set({ samples }),
    setCursor: (cursor) => set({ cursor }),
    setPicker: (picker) => set({ picker }),
  }));
}

export function store(): StoreApi<UiState> {
  if (!current) throw new Error("[colour-equaliser] store() called before activate()");
  return current;
}
