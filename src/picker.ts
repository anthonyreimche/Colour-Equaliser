// Ansel's colour picker, point form. While Pick is on it holds the canvas's
// pick-drag tool, so core routes one plain left click to it, takes turns with
// every other picker and on-image tool, pans on Ctrl / ⌘ / Space and lets go
// on Esc. Core's sampleView reads the click's 5×5 patch from a capture of the
// view with this stage bypassed (what the stage receives), and its dt UCS
// hue is marked on every graph with its brightness reported.

import { wrapHuePi } from "./curve";
import { KEY } from "./params";
import { api } from "./runtime";
import type { CanvasPoint, PickDragTool } from "./safelight";
import { store, type Picker } from "./store";
import { linearSrgbToHsb, srgbToLinear, type Vec3 } from "./ucs";

/** The dt UCS hue, in (−π, π], and brightness, held to 0..1, of a linear
 *  colour; null where it has no hue. */
export function readingOf(rgb: Vec3): Picker | null {
  const [hue, , brightness] = linearSrgbToHsb(rgb);
  if (!Number.isFinite(hue)) return null;
  return { hue: wrapHuePi(hue), brightness: brightness < 0 ? 0 : brightness > 1 ? 1 : brightness };
}

async function pickAt(point: CanvasPoint): Promise<void> {
  try {
    const srgb = await api().develop.sampleView(point, { [KEY.on]: 0 });
    const reading = srgb && readingOf([srgbToLinear(srgb[0]), srgbToLinear(srgb[1]), srgbToLinear(srgb[2])]);
    if (!reading || store().getState().mode !== "pick") return;
    store().getState().setPicker(reading);
    store().getState().setMode(null);
  } catch (err) {
    console.warn("[colour-equaliser] pick failed:", err);
  }
}

const PICK_TOOL: PickDragTool = { onPress: (point) => void pickAt(point) };

/** Hold the canvas's pick-drag tool while Pick is on, and let go when it
 *  ends. Returns the unsubscribe. */
export function holdPickDrag(): () => void {
  return store().subscribe((state, prev) => {
    if ((state.mode === "pick") !== (prev.mode === "pick")) api().develop.setPickDrag(state.mode === "pick" ? PICK_TOOL : null);
  });
}
