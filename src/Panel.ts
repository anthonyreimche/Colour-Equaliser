// The Develop panel: Ansel's ring tabs (shadows / midtones / highlights) over
// its channel tabs (saturation / brightness / hue) over the graph, then the
// picker and the adjust-on-image switch, then a collapsed Options section with
// the white level, the three smoothing radii, the neutral protection and the
// interpolation. The options sit below the graph rather than on a tab of their
// own, as darktable's colour equalizer now has them, so the graph never hides.
// Sliders write the bag live and commit on release. The active tabs are
// extension settings, not edits.
//
// It edits whatever useParamScope hands it: the photo's bag in the dock, a
// mask's in the Masking panel's Adjust tab. The picker and Adjust on image
// read the photo for its own equaliser, so they show only in the dock.

import { CHANNELS, type Channel } from "./curve";
import { INTERPOLATIONS, type Interpolation } from "./field";
import { EqualiserGraph } from "./Graph";
import { DEFAULT_PARAMS, type Params } from "./model";
import { deriveAll, readParams } from "./params";
import { RINGS, type Ring } from "./rings";
import { api, h } from "./runtime";
import { brightnessLabel } from "./sample";
import { store } from "./store";

export const SETTING = { ring: "ring", channel: "channel" } as const;

const RING_LABEL: Readonly<Record<Ring, string>> = {
  shadows: "Shadows",
  midtones: "Midtones",
  highlights: "Highlights",
};
const CHANNEL_LABEL: Readonly<Record<Channel, string>> = {
  saturation: "Saturation",
  brightness: "Brightness",
  hue: "Hue",
};
const INTERPOLATION_LABEL = ["Tetrahedral", "Trilinear", "Pyramid"] as const;

/** The saved ring tab; Shadows for anything else, such as the Options tab
 *  earlier releases saved. */
export function readRing(): Ring {
  const v = api().settings.get<string>(SETTING.ring, "shadows");
  return (RINGS as readonly string[]).includes(v) ? (v as Ring) : "shadows";
}

export function readChannel(): Channel {
  const v = api().settings.get<string>(SETTING.channel, "saturation");
  return (CHANNELS as readonly string[]).includes(v) ? (v as Channel) : "saturation";
}

export function EqualiserPanel() {
  const { useEffect, useState } = api().react;
  const { Panel, Slider, PickerIcon } = api().components;
  const { Button, Select, SegmentedControl, Row, Stack, tokens } = api().ui;
  const scope = api().develop.useParamScope();
  const inMask = scope.maskId !== null;
  const mode = store()((s) => s.mode);
  const picker = store()((s) => s.picker);
  const holdsPickDrag = api().develop.usePickDragHeld();
  const holdsCanvasTool = api().develop.useCanvasToolHeld();
  const [ring, setRing] = useState<Ring>(readRing);
  const [channel, setChannel] = useState<Channel>(readChannel);

  useEffect(() => (inMask ? undefined : () => store().getState().setMode(null)), [inMask]);
  // Core lets go of either tool on Escape or when another extension takes it.
  useEffect(() => {
    if (inMask) return;
    if ((mode === "pick" && !holdsPickDrag) || (mode === "adjust" && !holdsCanvasTool)) store().getState().setMode(null);
  }, [inMask, mode, holdsPickDrag, holdsCanvasTool]);

  const p = readParams(scope.getParams());
  const live = (): Params => readParams(scope.getParams());
  const apply = (next: Params) => scope.setParams(deriveAll(next));
  const commit = (what: string) => scope.commit(`Colour Equaliser ${what}`);

  const slider = (
    label: string,
    key: keyof Omit<Params, "curves" | "interpolation">,
    min: number,
    max: number,
    step: number,
  ) =>
    h(Slider, {
      key,
      label,
      value: p[key],
      min,
      max,
      step,
      defaultValue: DEFAULT_PARAMS[key],
      onChange: (v: number) => apply({ ...live(), [key]: v }),
      onCommit: () => commit(label.toLowerCase()),
    });

  const ringTabs = h(SegmentedControl, {
    key: "rings",
    value: ring,
    size: "sm",
    options: RINGS.map((value) => ({ value, label: RING_LABEL[value] })),
    onChange: (v: string) => {
      setRing(v as Ring);
      api().settings.set(SETTING.ring, v);
    },
  });

  const options = h(
    Panel,
    { key: "options", title: "Options", defaultOpen: false },
    h(
      Stack,
      { gap: 6 },
      h(
        "div",
        { key: "sliders", style: { display: "flex", flexDirection: "column", gap: 1 } },
        slider("White level", "whiteLevel", -2, 8, 0.01),
        slider("Brightness smoothing", "sigmaL", 1, 100, 1),
        slider("Saturation smoothing", "sigmaRho", 0.01, 2, 0.01),
        slider("Hue smoothing", "sigmaTheta", 0.01, 6.28, 0.01),
        slider("Neutral protection", "neutralProtection", 0, 2, 0.01),
      ),
      h(
        Row,
        { key: "interpolation", gap: 6 },
        h("span", { style: { fontSize: 11, color: tokens.textSecondary, whiteSpace: "nowrap" } }, "Interpolation"),
        h(
          "div",
          { style: { flex: "1 1 auto", minWidth: 0 } },
          h(Select, {
            value: String(p.interpolation),
            ariaLabel: "Interpolation",
            options: INTERPOLATIONS.map((_, i) => ({ value: String(i), label: INTERPOLATION_LABEL[i] })),
            onChange: (v: string) => {
              apply({ ...live(), interpolation: Number(v) as Interpolation });
              commit("interpolation");
            },
          }),
        ),
      ),
    ),
  );

  const channelTabs = h(SegmentedControl, {
    key: "channels",
    value: channel,
    size: "sm",
    options: CHANNELS.map((value) => ({ value, label: CHANNEL_LABEL[value] })),
    onChange: (v: string) => {
      setChannel(v as Channel);
      api().settings.set(SETTING.channel, v);
    },
  });

  const toggle = (which: "pick" | "adjust") => store().getState().setMode(mode === which ? null : which);

  const tools = h(
    Row,
    { key: "tools", gap: 6 },
    h(
      Button,
      { size: "sm", active: mode === "pick", title: "Mark a colour from the image on the graphs (Esc cancels)", onClick: () => toggle("pick") },
      h(Row, { gap: 4, align: "center" }, h(PickerIcon, { size: 12 }), "Pick"),
    ),
    h(
      "span",
      { style: { flex: "1 1 auto", minWidth: 0, fontSize: 10, color: tokens.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
      picker ? brightnessLabel(picker.brightness) : "No sample",
    ),
    h(
      Button,
      {
        size: "sm",
        active: mode === "adjust",
        title: "Adjust the active curve from the image: hover to mark its hue, scroll to shape the curve there (Shift coarse, Alt fine), right-click to add a node (Esc ends)",
        onClick: () => toggle("adjust"),
      },
      "Adjust on image",
    ),
  );

  return h(
    "div",
    { style: { display: "flex", flexDirection: "column" } },
    h(
      Stack,
      { key: "curves", gap: 6, style: { padding: "6px 8px 8px" } },
      ringTabs,
      channelTabs,
      h(EqualiserGraph, { key: `${ring}/${channel}`, ring, channel }),
      inMask ? null : tools,
    ),
    options,
  );
}
