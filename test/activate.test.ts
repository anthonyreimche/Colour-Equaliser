// Activation contract against a stand-in API: what activate() registers under
// the extension id, that a bag whose gate disagrees with its curves is
// re-derived live, and that deactivate() tears everything down. No React
// render — the components are exercised in the app.

import { afterEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../src/index";
import { DEFAULT_PARAMS } from "../src/model";
import { EqualiserPanel } from "../src/Panel";
import { KEY, STAGE_ID, deriveAll } from "../src/params";
import { store } from "../src/store";
import { fakeStore } from "./support/fake-store";
import { paramsFromReference } from "./support/reference-params";
import { V } from "./support/vectors";
import type {
  CanvasTool,
  DevelopStoreState,
  PanelContribution,
  PickDragTool,
  ProcessingStageContribution,
  SafelightAPI,
  SlotContribution,
} from "../src/safelight";

interface Registered {
  stages: ProcessingStageContribution[];
  panels: PanelContribution[];
  slots: SlotContribution[];
  unregisteredStages: string[];
  unregisteredSlots: string[];
  patches: Record<string, unknown>[];
  /** What the extension handed setCanvasTool, in order. */
  canvasTools: (CanvasTool | null)[];
  /** What the extension handed setPickDrag, in order. */
  pickDrags: (PickDragTool | null)[];
}

function fakeApi() {
  const registered: Registered = { stages: [], panels: [], slots: [], unregisteredStages: [], unregisteredSlots: [], patches: [], canvasTools: [], pickDrags: [] };
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
    develop: {
      setCanvasTool: (tool: CanvasTool | null) => void registered.canvasTools.push(tool),
      setPickDrag: (tool: PickDragTool | null) => void registered.pickDrags.push(tool),
    },
    stores: { create: fakeStore, useDevelopStore: develop },
  } as unknown as SafelightAPI;
  return { api, registered, develop };
}

describe("activate", () => {
  afterEach(() => deactivate());

  it("registers the stage and the panel, and no canvas overlay", () => {
    const { api, registered } = fakeApi();
    activate(api);
    expect(registered.stages.map((s) => s.id)).toEqual([STAGE_ID]);
    expect(registered.panels.map((p) => p.id)).toEqual(["colour-equaliser.panel"]);
    expect(registered.panels[0].title).toBe("Colour Equaliser");
    expect(registered.panels[0].defaultDock).toMatchObject({ module: "develop", direction: "right" });
    expect(typeof registered.panels[0].onReset).toBe("function");
    expect(registered.slots).toEqual([]);
  });

  it("offers the panel in masks, owning every key it writes", () => {
    const { api, registered } = fakeApi();
    activate(api);
    expect(registered.panels[0].mask?.component).toBe(EqualiserPanel);
    expect([...(registered.panels[0].mask?.owns ?? [])].sort()).toEqual(Object.keys(deriveAll(DEFAULT_PARAMS)).sort());
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

  it("holds core's pick-drag tool for Pick and a zoomable canvas tool for Adjust, one at a time", () => {
    const { api, registered } = fakeApi();
    activate(api);
    store().getState().setMode("pick");
    expect(registered.pickDrags).toEqual([expect.objectContaining({ onPress: expect.any(Function) })]);
    expect(registered.canvasTools).toEqual([]);
    store().getState().setMode("adjust");
    expect(registered.pickDrags[1]).toBeNull();
    expect(registered.canvasTools).toEqual([expect.objectContaining({ zoomable: true, overlay: expect.any(Function) })]);
    store().getState().setMode(null);
    expect(registered.canvasTools).toHaveLength(2);
    expect(registered.canvasTools[1]).toBeNull();
    expect(registered.pickDrags).toHaveLength(2);
  });

  it("ends the mode on the canvas tool's Escape", () => {
    const { api, registered } = fakeApi();
    activate(api);
    store().getState().setMode("adjust");
    registered.canvasTools[0]?.onEscape?.();
    expect(store().getState().mode).toBeNull();
  });

  it("clears the on-image mode, lets the tools go, drops the stage and stops listening on deactivate", () => {
    const { api, registered, develop } = fakeApi();
    activate(api);
    store().getState().setMode("pick");
    deactivate();
    expect(store().getState().mode).toBeNull();
    expect(registered.pickDrags).toEqual([expect.any(Object), null]);
    expect(registered.unregisteredStages).toEqual([STAGE_ID]);
    expect(registered.unregisteredSlots).toEqual([]);
    develop.setState({ paramBag: { ...deriveAll(paramsFromReference(V.params[0])), [KEY.on]: 0 } });
    expect(registered.patches.length).toBe(0);
  });
});
