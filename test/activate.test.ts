// Activation contract against a stand-in API: what activate() registers under
// the extension id, that a bag whose gate disagrees with its curves is
// re-derived live, and that deactivate() tears everything down. No React
// render — the components are exercised in the app.

import { afterEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../src/index";
import { DEFAULT_PARAMS } from "../src/model";
import { KEY, STAGE_ID, deriveAll } from "../src/params";
import { store } from "../src/store";
import { paramsFromReference } from "./support/reference-params";
import { V } from "./support/vectors";
import type {
  DevelopStoreState,
  PanelContribution,
  ProcessingStageContribution,
  SafelightAPI,
  SlotContribution,
  StateCreator,
  StoreApi,
} from "../src/safelight";

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

interface Registered {
  stages: ProcessingStageContribution[];
  panels: PanelContribution[];
  slots: SlotContribution[];
  unregisteredStages: string[];
  unregisteredSlots: string[];
  patches: Record<string, unknown>[];
}

function fakeApi() {
  const registered: Registered = { stages: [], panels: [], slots: [], unregisteredStages: [], unregisteredSlots: [], patches: [] };
  const develop = fakeStore<DevelopStoreState>({
    photoId: null,
    paramBag: {},
    histogram: null,
    previewParams: null,
    setDynParams: (patch) => {
      registered.patches.push(patch);
      develop.setState((s) => ({ paramBag: { ...s.paramBag, ...patch } }));
    },
  } as Partial<DevelopStoreState> as DevelopStoreState);
  const values = new Map<string, unknown>();
  const api = {
    version: 1,
    extensionId: "colour-equaliser",
    registerProcessingStage: (c: ProcessingStageContribution) => void registered.stages.push(c),
    unregisterProcessingStage: (id: string) => void registered.unregisteredStages.push(id),
    registerPanel: (c: PanelContribution) => void registered.panels.push(c),
    registerSlot: (c: SlotContribution) => void registered.slots.push(c),
    unregisterSlot: (id: string) => void registered.unregisteredSlots.push(id),
    settings: {
      get: <T,>(key: string, fallback: T) => (values.has(key) ? (values.get(key) as T) : fallback),
      set: (key: string, value: unknown) => void values.set(key, value),
      onChange: () => () => undefined,
    },
    stores: { create: fakeStore, useDevelopStore: develop },
  } as unknown as SafelightAPI;
  return { api, registered, develop };
}

describe("activate", () => {
  afterEach(() => deactivate());

  it("registers the stage, the panel and the overlay slot", () => {
    const { api, registered } = fakeApi();
    activate(api);
    expect(registered.stages.map((s) => s.id)).toEqual([STAGE_ID]);
    expect(registered.panels.map((p) => p.id)).toEqual(["colour-equaliser.panel"]);
    expect(registered.panels[0].title).toBe("Colour Equaliser");
    expect(registered.panels[0].defaultDock).toMatchObject({ module: "develop", direction: "right" });
    expect(typeof registered.panels[0].onReset).toBe("function");
    expect(registered.slots).toMatchObject([{ id: "colour-equaliser.overlay", slot: "develop-canvas-overlay" }]);
  });

  it("resets the photo's equaliser to Ansel's defaults from the dock header", () => {
    const { api, registered, develop } = fakeApi();
    const commits: string[] = [];
    develop.setState({ commitEdit: async (label: string) => void commits.push(label) });
    activate(api);
    develop.setState({ paramBag: deriveAll(paramsFromReference(V.params[0])) });
    registered.panels[0].onReset?.();
    expect(develop.getState().paramBag[KEY.on]).toBe(0);
    expect(develop.getState().paramBag).toMatchObject(deriveAll(DEFAULT_PARAMS));
    expect(commits.length).toBe(1);
  });

  it("re-derives the gate when a loaded bag disagrees with its curves", () => {
    const { api, registered, develop } = fakeApi();
    activate(api);
    const p = paramsFromReference(V.params[0]);
    develop.setState({ paramBag: { ...deriveAll(p), [KEY.on]: 0 } });
    expect(registered.patches.length).toBe(1);
    expect(registered.patches[0]).toEqual(deriveAll(p));
    develop.setState({ paramBag: deriveAll(p) });
    expect(registered.patches.length).toBe(1);
  });

  it("clears the overlay mode, drops the stage and the slot, and stops listening on deactivate", () => {
    const { api, registered, develop } = fakeApi();
    activate(api);
    store().getState().setMode("adjust");
    deactivate();
    expect(store().getState().mode).toBeNull();
    expect(registered.unregisteredStages).toEqual([STAGE_ID]);
    expect(registered.unregisteredSlots).toEqual(["colour-equaliser.overlay"]);
    develop.setState({ paramBag: { ...deriveAll(paramsFromReference(V.params[0])), [KEY.on]: 0 } });
    expect(registered.patches.length).toBe(0);
  });
});
