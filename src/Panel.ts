// The Develop panel: Ansel's ring tabs (shadows / midtones / highlights /
// options) over its channel tabs (saturation / brightness / hue) over the
// graph, then the picker and the adjust-on-image switch; the options page
// carries the white level, the three smoothing radii, the neutral protection
// and the interpolation. Sliders write the bag live and commit on release.
// The active tabs are extension settings, not edits.

import type { CSSProperties } from "react";
import { CHANNELS, type Channel } from "./curve";
import { INTERPOLATIONS, type Interpolation } from "./field";
import { EqualiserGraph } from "./Graph";
import { DEFAULT_PARAMS, type Params } from "./model";
import { deriveAll, readParams } from "./params";
import { RINGS, type Ring } from "./rings";
import { api, h } from "./runtime";
import { brightnessLabel, startLiveSampler } from "./sample";
import { store } from "./store";

export const SETTING = { ring: "ring", channel: "channel" } as const;

type Page = Ring | "options";
const PAGES: readonly Page[] = [...RINGS, "options"];
const PAGE_LABEL: Readonly<Record<Page, string>> = {
  shadows: "Shadows",
  midtones: "Midtones",
  highlights: "Highlights",
  options: "Options",
};
const CHANNEL_LABEL: Readonly<Record<Channel, string>> = {
  saturation: "Saturation",
  brightness: "Brightness",
  hue: "Hue",
};
const INTERPOLATION_LABEL = ["Tetrahedral", "Trilinear", "Pyramid"] as const;

const HINT =
  "Drag a node · Ctrl+click adds one · right-click removes it · double-click resets the curve · " +
  "Adjust on image: scroll over the photo (Shift coarse, Alt fine), right-click adds a node there";

const HINT_STYLE: CSSProperties = { margin: 0, fontSize: 10, lineHeight: 1.4, color: "var(--color-text-muted)" };

export function readPage(): Page {
  const v = api().settings.get<string>(SETTING.ring, "shadows");
  return (PAGES as readonly string[]).includes(v) ? (v as Page) : "shadows";
}

export function readChannel(): Channel {
  const v = api().settings.get<string>(SETTING.channel, "saturation");
  return (CHANNELS as readonly string[]).includes(v) ? (v as Channel) : "saturation";
}

export function EqualiserPanel() {
  const { useEffect, useState } = api().react;
  const { Slider } = api().components;
  const { Button, Select, SegmentedControl, Row, Stack } = api().ui;
  const dev = api().stores.useDevelopStore;
  const paramBag = dev((s) => s.paramBag);
  const mode = store()((s) => s.mode);
  const picker = store()((s) => s.picker);
  const [page, setPage] = useState<Page>(readPage);
  const [channel, setChannel] = useState<Channel>(readChannel);

  useEffect(() => startLiveSampler(), []);
  useEffect(() => () => store().getState().setMode(null), []);

  const p = readParams(paramBag);
  const live = (): Params => readParams(dev.getState().paramBag);
  const apply = (next: Params) => dev.getState().setDynParams(deriveAll(next));
  const commit = (what: string) => void dev.getState().commitEdit(`Colour Equaliser ${what}`);

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

  const pageTabs = h(SegmentedControl, {
    key: "pages",
    value: page,
    size: "sm",
    options: PAGES.map((value) => ({ value, label: PAGE_LABEL[value] })),
    onChange: (v: string) => {
      setPage(v as Page);
      api().settings.set(SETTING.ring, v);
    },
  });

  if (page === "options") {
    return h(
      Stack,
      { gap: 6, style: { padding: "6px 8px 8px" } },
      pageTabs,
      h(
        "div",
        { key: "options", style: { display: "flex", flexDirection: "column", gap: 1 } },
        slider("White level", "whiteLevel", -2, 8, 0.01),
        slider("Brightness smoothing", "sigmaL", 1, 100, 1),
        slider("Saturation smoothing", "sigmaRho", 0.01, 2, 0.01),
        slider("Hue smoothing", "sigmaTheta", 0.01, 6.28, 0.01),
        slider("Neutral protection", "neutralProtection", 0, 2, 0.01),
      ),
      h(
        Row,
        { key: "interpolation", gap: 6 },
        h("span", { style: { fontSize: 11, color: "var(--color-text-secondary)", whiteSpace: "nowrap" } }, "Interpolation"),
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
    );
  }

  const ring: Ring = page;
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
    h(Button, { size: "sm", active: mode === "pick", title: "Mark a colour from the image on the graphs (Esc cancels)", onClick: () => toggle("pick") }, "Pick"),
    h(
      "span",
      { style: { flex: "1 1 auto", minWidth: 0, fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
      picker ? brightnessLabel(picker.brightness) : "No sample",
    ),
    h(
      Button,
      {
        size: "sm",
        active: mode === "adjust",
        title: "Adjust the active curve from the image: hover to mark its hue, scroll to shape the curve there, right-click to add a node (Esc ends)",
        onClick: () => toggle("adjust"),
      },
      "Adjust on image",
    ),
  );

  return h(
    Stack,
    { gap: 6, style: { padding: "6px 8px 8px" } },
    pageTabs,
    channelTabs,
    h(EqualiserGraph, { key: `${ring}/${channel}`, ring, channel }),
    tools,
    h("p", { key: "hint", style: HINT_STYLE }, HINT),
  );
}
