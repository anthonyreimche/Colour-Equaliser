// Session state shared by the panel, the graph and the overlay: the mode the
// overlay is armed for, the latest frame samples, the cursor the graph marks
// while adjusting on the image, and the picker's reading. Built on the host's
// zustand `create` so the components subscribe like core.

import { api } from "./runtime";
import type { StoreApi } from "./safelight";
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

/** The photo as this stage receives it (rendered with the stage bypassed)
 *  and as it leaves the pipeline. */
export interface Samples {
  input: FrameSample | null;
  output: FrameSample | null;
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
  samples: Samples;
  cursor: Cursor | null;
  picker: Picker | null;
  setMode(mode: Mode): void;
  setSamples(samples: Samples): void;
  setCursor(cursor: Cursor | null): void;
  setPicker(picker: Picker | null): void;
}

let current: StoreApi<UiState> | null = null;

export function initStore(): void {
  current = api().stores.create<UiState>((set) => ({
    mode: null,
    samples: { input: null, output: null },
    cursor: null,
    picker: null,
    setMode: (mode) => set({ mode, cursor: null }),
    setSamples: (samples) => set({ samples }),
    setCursor: (cursor) => set({ cursor }),
    setPicker: (picker) => set({ picker }),
  }));
}

export function store(): StoreApi<UiState> {
  if (!current) throw new Error("[colour-equaliser] store() called before activate()");
  return current;
}
