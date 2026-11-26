// The slice of Safelight's extension API this extension touches, mirrored from
// the app's src/extensions/types.ts, src/extensions/ui-kit.tsx,
// src/extensions/develop-host.tsx and src/state/develop-store.ts. Extensions are
// standalone bundles, so the host's source is not on the type path; React types
// come from @types/react (dev only).

import type { ComponentType, CSSProperties, ReactNode } from "react";

export interface ActiveIdState {
  activeId: string;
}

export interface StoreApi<T> {
  (): T;
  <U>(selector: (state: T) => U): U;
  getState(): T;
  setState(partial: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: (state: T, prev: T) => void): () => void;
}

export type StateCreator<T> = (
  set: (partial: Partial<T> | ((s: T) => Partial<T>)) => void,
  get: () => T,
) => T;

/** Core develop params: opaque here, only ever handed back to core. */
export type DevelopParams = Record<string, unknown> & { readonly __develop: unique symbol };

export interface DevelopStoreState {
  photoId: string | null;
  params: DevelopParams;
  previewParams: DevelopParams | null;
  /** Extension stage params by qualified key. Values are whatever the owning
   *  stage wrote and come back from sidecar JSON — a runtime boundary. */
  paramBag: Record<string, unknown>;
  /** Recomputed by core after every settled render; its identity changing is
   *  the "frame changed" signal. */
  histogram: object | null;
  setDynParams(patch: Record<string, unknown>): void;
  commitEdit(label: string): Promise<void>;
}

export interface OverlayRect2 {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An extension's on-image tool that takes the canvas over while it is held. */
export interface CanvasTool {
  /** Drawn over the image, inside the view: `rect` is the box the frame
   *  shows. Reads the canvas mapping with api.develop.useDevelopOverlay. */
  overlay: ComponentType<{
    rect: OverlayRect2;
  }>;
  /** Whether zoom and pan still reach the canvas under the overlay. */
  zoomable?: boolean;
  /** Escape was pressed: core lets the tool go after this. */
  onEscape?(): void;
}

/** A point on the canvas, in its pixels, from its top-left corner. */
export interface CanvasPoint {
  x: number;
  y: number;
}

export interface PickDragTool {
  /** A press on the image, as it happens. */
  onPress?(point: CanvasPoint): void;
  /** A press on the image with the colour the view shows there, sRGB 0-1,
   *  once the probe answers; never for a press released before that. */
  onDown?(rgb: readonly [number, number, number], point: CanvasPoint): void;
  /** The drag, after an onDown. */
  onMove?(point: CanvasPoint): void;
  /** The drag ended, after an onDown. */
  onUp?(): void;
}

export interface PickerIconProps {
  size?: number;
}

declare function PickerIcon({ size }: PickerIconProps): import("react").JSX.Element;

export type GlslType = "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "sampler2D";

export interface UniformDeclaration {
  key: string;
  glslType: GlslType;
  default: number | number[] | boolean;
  range?: { min: number; max: number; step?: number };
  label?: string;
}

export interface StagePass {
  glsl: string;
  helpers?: string;
  iterations?: number;
  uniforms?: UniformDeclaration[];
}

export type ProcessingPhase =
  | "geometry"
  | "decode"
  | "noise-reduction"
  | "scene-linear"
  | "tone-map"
  | "display-adjust"
  | "effects"
  | "output-encode";

export interface ProcessingStageContribution {
  id: string;
  name: string;
  phase: ProcessingPhase;
  priority?: number;
  glsl: string;
  helpers?: string;
  uniforms: UniformDeclaration[];
  passes?: StagePass[];
  presetScope?: "global" | "per-image";
  /** Runs the stage again inside each mask whose bag holds its keys, with that
   *  mask's values, blended by its coverage (Safelight 3.1.0, process version 2
   *  photos). */
  mask?: { maskable: true };
}

export interface PanelContribution {
  id: string;
  title: string;
  component: ComponentType;
  defaultDock?: {
    module: "library" | "develop";
    direction: "left" | "right" | "bottom";
    order?: number;
    width?: number;
    height?: number;
  };
  /** The modules the panel may be docked in; omitted, every module (Safelight 3.2.8). */
  modules?: readonly string[];
  onReset?: () => void;
  /** Offers the panel in a mask's Adjust tab: each mask that adds it renders
   *  `component`, which edits that mask's values through useParamScope. `owns`
   *  lists every qualified key it writes, seeded on add and cleared on remove. */
  mask?: { component: ComponentType; order?: number; owns: readonly string[] };
}

/** The params a panel edits: the photo's bag, or one mask's (maskId set).
 *  Reads see the store as it is now, not as the render was handed it. */
export interface ParamScope {
  maskId: string | null;
  getParam(key: string): unknown;
  /** The stored values by qualified key, without defaults. */
  getParams(): Readonly<Record<string, unknown>>;
  setParams(patch: Record<string, unknown>): void;
  commit(label: string): void;
}

export interface SlotContribution {
  id: string;
  slot: "develop-canvas-overlay" | "develop-toolbar" | "library-toolbar" | "library-subbar";
  component: ComponentType;
  order?: number;
}

export interface SliderProps {
  label: string;
  value: number;
  onChange(value: number): void;
  onCommit?(): void;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  hideValue?: boolean;
  compact?: boolean;
  trackBackground?: string;
}

export interface PanelProps {
  title: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}

export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  active?: boolean;
  full?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?(): void;
  children?: ReactNode;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange(value: string): void;
  options?: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  title?: string;
}

export interface SegmentedControlProps {
  value: string;
  onChange(value: string): void;
  options: SegmentedOption[];
  size?: "sm" | "md";
}

export interface RowProps {
  children?: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  wrap?: boolean;
  style?: CSSProperties;
}

export interface StackProps {
  children?: ReactNode;
  gap?: number;
  style?: CSSProperties;
}

export interface UiKit {
  Button: ComponentType<ButtonProps>;
  Select: ComponentType<SelectProps>;
  SegmentedControl: ComponentType<SegmentedControlProps>;
  Row: ComponentType<RowProps>;
  Stack: ComponentType<StackProps>;
  tokens: Readonly<Record<string, string>>;
}

export interface SafelightAPI {
  version: 1;
  extensionId: string;
  react: typeof import("react");
  registerProcessingStage(c: ProcessingStageContribution): void;
  unregisterProcessingStage(id: string): void;
  registerPanel(c: PanelContribution): void;
  registerSlot(c: SlotContribution): void;
  unregisterSlot(id: string): void;
  settings: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
    onChange(cb: (key: string, value: unknown) => void): () => void;
  };
  components: {
    Slider: ComponentType<SliderProps>;
    Panel: ComponentType<PanelProps>;
    PickerIcon: typeof PickerIcon;
  };
  ui: UiKit;
  stores: {
    create<T>(init: StateCreator<T>): StoreApi<T>;
    useDevelopStore: StoreApi<DevelopStoreState>;
    useThemeStore: StoreApi<ActiveIdState>;
  };
  cursors: {
    resolve(token: string): string;
  };
  develop: {
    /** The frame covers the region the view shows, whatever crop `params`
     *  carry: in crop mode the whole photo and its margin, as the canvas shows
     *  it. The frame is for measuring: sRGB, and without the clipping warning, the
     *  mask overlay and the sharpening preview the view may be showing. Pass
     *  `{ asShown: true }` for a frame drawn over the canvas: it keeps those
     *  overlays, and on Linux with a display profile set it is converted to
     *  the monitor like the canvas is (elsewhere the two match). `paramBag` is
     *  merged over the photo's extension-stage params for this capture only,
     *  e.g. a stage's switch to render an auxiliary image (a gain map, a mask)
     *  aligned to the live view. Neither the params nor the bag reach the live
     *  view or the core's measurements of it (the histogram, Auto Tone, Auto
     *  WB, Upright). */
    captureFrame(params: DevelopParams, options?: {
      asShown?: boolean;
      paramBag?: Record<string, unknown>;
    }): Promise<ImageBitmap>;
    /** What ColourField's eyedropper reads: the average of the 5×5 pixels
     *  around `point` (in the canvas's pixels, as the pick-drag tool gives
     *  them) of a capture of the view, sRGB 0-1, with `paramBag` merged over
     *  the photo's and over each mask's copy of a stage it names, to leave
     *  your own effect out of the sample. Null off the frame, without a
     *  renderer, or when another photo opened before the capture landed.
     *  Needs Safelight 3.2.8. */
    sampleView(point: CanvasPoint, paramBag?: Record<string, unknown>): Promise<readonly [number, number, number] | null>;
    /** React hook: the canvas mapping, for a canvas tool's overlay. `rect` is
     *  where the view's frame (what captureFrame returns) sits in the
     *  overlay's layout px, the visible window when zoomed; null until the
     *  first layout. `nonce` changes whenever the view's geometry does (zoom,
     *  pan, fit, resize, another photo). */
    useDevelopOverlay(): { rect: OverlayRect2 | null; nonce: number };
    /** Hold the develop canvas with an on-image tool (canvas-tool.ts), or with
     *  null let go of it. While it's held, its `overlay` is drawn over the
     *  image inside the view, core's own canvas gestures stand aside (zoom
     *  too, unless `zoomable`), and the live view draws `viewParams` of the
     *  edit if given. Escape calls `onEscape` and lets it go. One extension
     *  holds it at a time: the last to set it. It is let go when the
     *  extension stops. Needs Safelight 3.2.0. */
    setCanvasTool(tool: CanvasTool | null): void;
    /** React hook: whether this extension holds the canvas tool. */
    useCanvasToolHeld(): boolean;
    /** Hold the canvas's pick-drag tool (an eyedropper or on-image target
     *  tool), or with null let go of it. While it's held, a press on the image
     *  calls `tool.onPress` with the point in the canvas's pixels at once;
     *  with `onDown`, it is also handed the colour the view shows there (sRGB,
     *  0-1) once the probe answers, then the drag to `onMove` and its end to
     *  `onUp`. A held Ctrl, Cmd or Space pans instead, and Escape lets go.
     *  One extension holds it at a time: the last to set it. It is let go when
     *  the extension stops. */
    setPickDrag(tool: PickDragTool | null): void;
    /** React hook: whether this extension holds the pick-drag tool. */
    usePickDragHeld(): boolean;
    /** The pointer in `el`'s layout px: the space an overlay's `rect`, the
     *  mapping helpers and CSS left/top use. Interface scale zooms the page,
     *  so clientX minus the element's left is off by the zoom. Needs Safelight
     *  3.2.7. */
    framePoint(el: Element, clientX: number, clientY: number): {
      x: number;
      y: number;
    };
    /** The mask's scope inside a mask's Adjust tab, the photo's anywhere else. */
    useParamScope(): ParamScope;
  };
}

export interface ExtensionModule {
  activate(api: SafelightAPI): void;
  deactivate?(): void;
}
