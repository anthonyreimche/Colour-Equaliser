// Colour Equaliser — Safelight extension (GPL-3.0-or-later).
//
// A port of Ansel's colour equalizer (© Aurélien Pierre): three brightness
// rings of periodic hue curves — saturation, brightness, hue — authored in
// darktable UCS and applied as a colour lookup table in HLG Rec2020.
// Registers one scene-linear GPU stage (stage.ts), the Develop panel
// (Panel.ts), the on-image picker (picker.ts) and adjustment tool (Overlay.ts).

import { holdAdjustTool } from "./Overlay";
import { EqualiserPanel } from "./Panel";
import { EXT_ID, KEY, curveKeys, rederivePatch, resetPatch } from "./params";
import { holdPickDrag } from "./picker";
import { api, initRuntime } from "./runtime";
import type { DevelopStoreState, SafelightAPI } from "./safelight";
import { allStages } from "./stage";
import { initStore, store } from "./store";

const PANEL_ID = `${EXT_ID}.panel`;

let unsubscribe: (() => void) | null = null;
let releaseTools: (() => void)[] = [];

function reset(): void {
  const dev = api().stores.useDevelopStore.getState();
  dev.setDynParams(resetPatch());
  void dev.commitEdit("Colour Equaliser reset");
}

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  initStore();

  // `on` stays 0 while every curve is flat, so an untouched photo renders
  // unchanged.
  for (const stage of allStages()) host.registerProcessingStage(stage);

  host.registerPanel({
    id: PANEL_ID,
    title: "Colour Equaliser",
    component: EqualiserPanel,
    defaultDock: { module: "develop", direction: "right", order: 7, width: 268 },
    modules: ["develop"],
    onReset: reset,
    // The same panel edits a mask's curves and options in the Masking panel's
    // Adjust tab; the picker and Adjust on image stay the photo's.
    mask: { component: EqualiserPanel, owns: [...curveKeys(), ...Object.values(KEY)] },
  });

  releaseTools = [holdPickDrag(), holdAdjustTool()];
  // A bag whose gate disagrees with its curves (a preset that carried only
  // some keys, an edit from another release) is re-derived live; the edit
  // itself is rewritten by the next commit, as any other change would be.
  unsubscribe = host.stores.useDevelopStore.subscribe((state: DevelopStoreState, prev: DevelopStoreState) => {
    if (state.paramBag === prev.paramBag) return;
    const patch = rederivePatch(state.paramBag);
    if (patch) state.setDynParams(patch);
  });
}

export function deactivate(): void {
  unsubscribe?.();
  unsubscribe = null;
  // The host sweeps this extension's registrations on disable or uninstall;
  // dropping them explicitly keeps a re-enable clean.
  try {
    store().getState().setMode(null);
    for (const release of releaseTools) release();
    releaseTools = [];
    const host = api();
    for (const stage of allStages()) host.unregisterProcessingStage(stage.id);
  } catch {
    /* activate() never ran — nothing to tear down */
  }
}
