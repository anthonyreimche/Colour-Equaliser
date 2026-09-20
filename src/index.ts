// Colour Equaliser — Safelight extension (GPL-3.0-or-later).
//
// A port of Ansel's colour equalizer (© Aurélien Pierre): three brightness
// rings of periodic hue curves — saturation, brightness, hue — authored in
// darktable UCS and applied as a colour lookup table in HLG Rec2020.
// Registers one scene-linear GPU stage (stage.ts), the Develop panel
// (Panel.ts) and the on-image picker / adjustment overlay (Overlay.ts).

import { EqualiserOverlay } from "./Overlay";
import { EqualiserPanel } from "./Panel";
import { EXT_ID, rederivePatch, resetPatch } from "./params";
import { api, initRuntime } from "./runtime";
import type { DevelopStoreState, SafelightAPI } from "./safelight";
import { allStages } from "./stage";
import { initStore, store } from "./store";

const PANEL_ID = `${EXT_ID}.panel`;
const OVERLAY_ID = `${EXT_ID}.overlay`;

let unsubscribe: (() => void) | null = null;

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
    onReset: reset,
  });

  host.registerSlot({
    id: OVERLAY_ID,
    slot: "develop-canvas-overlay",
    component: EqualiserOverlay,
    order: 60,
  });

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
    const host = api();
    for (const stage of allStages()) host.unregisterProcessingStage(stage.id);
    host.unregisterSlot(OVERLAY_ID);
  } catch {
    /* activate() never ran — nothing to tear down */
  }
}
