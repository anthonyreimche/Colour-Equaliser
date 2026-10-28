# Colour Equaliser for SafeLight

A [SafeLight](https://github.com/anthonyreimche/SafeLight) extension that ports
[**Ansel**](https://ansel.photos/)'s *colour equalizer* (© Aurélien Pierre) into
SafeLight's Develop module. Three brightness rings — shadows, midtones,
highlights — each carry three hue curves for saturation, brightness and hue;
the rings are authored in darktable UCS and applied through a colour lookup
table in HLG Rec2020, with Ansel's smoothing radii, neutral protection and
interpolation choices. Same tabs, same graphs, same gestures, same maths.

This is Ansel's 2026 rewrite of the module (colour rings and a lookup table),
not the colour equalizer darktable ships (the 2022 prototype with the guided
filter). The two share a name and the hue convention; nothing else.

## What it does

Ansel's module normalises the image by a **white level**, takes it to
**HLG-encoded Rec2020** code values, runs it through a 64³ **colour lookup
table**, and takes it back. The table is authored from three **rings** at dt UCS
brightness 0.15 / 0.45 / 0.75, each at the largest saturation that keeps the
whole ring inside sRGB. On every ring you shape three periodic **hue curves**:

- **saturation** — a gain, 0 to 2× (the centre line is 1×);
- **brightness** — a gain, 0 to 2×;
- **hue** — a shift, ±180°.

Each ring is sampled at 64 hues; the ring's own colour and its edited colour
become a *before* / *after* pair, projected onto the RGB cube and expressed in
a grey-cylindrical frame (lightness along the grey diagonal, chroma off it,
hue around it). Every lattice point of the table then blends the displacements
of the anchors within its smoothing ellipsoid with a Wendland C2 kernel, fades
the result out below the neutral-protection chroma, and lands back inside the
cube. A fourth ring of fixed anchors along the grey diagonal pins the neutrals.

## Controls

Ansel's, in Ansel's order:

- **Shadows · Midtones · Highlights** tabs, then **Saturation · Brightness ·
  Hue** tabs (one channel selection for all rings, as in Ansel). Below them the
  graph: the ring's colours as a background, the channel's effect running up
  the y axis, an 8×8 grid, the centre line, a hue axis strip. Red sits at the
  left edge.
- **The graph**: drag a node; **Ctrl+click** adds one on the curve (up to 20,
  never closer than 0.01 to a neighbour); **right-click** removes the selected
  node (never below 2); **double-click** resets the curve to eight flat nodes.
  Drags commit on release; the rest commit at once.
- **Pick**: click a spot in the image to mark its hue on every graph; the label
  reports where its brightness sits between the rings ("40% shadows, 60%
  midtones"). Esc cancels.
- **Adjust on image** (Ansel's behaviour while the module has focus, made an
  explicit switch): hovering the photo marks the colour's hue on the active
  graph and draws Ansel's marker over the image — the input colour inside, the
  output colour outside, an arc for the curve's offset. The **wheel** shapes the
  active curve around that hue (Shift = coarse, Alt = fine; Ctrl stays the
  app's pan/zoom); **right-click** adds a node there. One scroll gesture is one
  undo entry. Esc or the button ends the mode.
- **Options**: White level (EV, Ansel's default +1), Brightness smoothing (%),
  Saturation smoothing, Hue smoothing (radians), Neutral protection,
  Interpolation (tetrahedral / trilinear / pyramid).
- **In masks:** add Colour Equaliser to a mask from the Masking panel's Adjust
  tab to run a second equaliser inside that mask only, with its own curves and
  options. The mask's panel has everything the dock's has except Pick, Adjust
  on image and the marks they leave on the graph, which read the photo for its
  own equaliser. It needs the current processing: on a photo edited in an
  earlier Safelight, use Update processing first. Each mask that uses it builds
  its own table, so many such masks take a moment longer to show.
- **Reset** from the panel's dock header menu.

Settings persist per photo, take part in undo and presets, and render
identically in Develop, thumbnails and export. Until a node leaves the centre
line the stage is a bit-exact no-op.

## The math

Faithful to `src/iop/colorequal.c` and `src/pixel/colorequal_shared.c` (Ansel
master, September 2026):

- **Curves.** The periodic monotone Hermite spline of darktable's
  `math/splines.cpp` (period 1; averaged secant tangents, zero at a sign change,
  the Fritsch–Carlson limiter applied segment by segment). A node's y reads as
  `(y − 0.5)·2π` on the hue curve and `clamp(2y, 0, 2)` on the others. Curve x
  maps to dt UCS hue as `wrap((360x + 20)°)`.
- **Rings.** dt UCS 22 (`colorspaces_inline_conversions.h`, every constant
  verbatim). The reference saturation per ring is Ansel's 18-step bisection over
  64 hues through CAT16 to D50 and the Bradford D50 sRGB matrix. Anchors are
  converted with `dt UCS HSB → XYZ D65 → CAT16 → D50 → HLG Rec2020` — Ansel's
  own mix of CAT16 for that hop and Bradford-adapted profile matrices, kept as
  is so the anchors land where Ansel's do — then projected onto the cube shell
  around the ring's grey. The chroma scale is the requested saturation gain,
  capped by what the cube allowed; the hue shift becomes a rotation about the
  grey axis.
- **Field.** For a lattice point, anchors inside `(ΔL/σ_L)² + (Δρ/σ_ρ)² +
  (Δθ/σ_θ)² < 1` are averaged with the Wendland C2 kernel `(1−d)⁴(4d+1)` (the
  achromatic ring at 1/64 weight), faded by a smoothstep of `ρ / (neutral
  protection · σ_ρ)`, applied in the cylindrical frame, projected back.
  `σ_L = brightness smoothing / 100`, `σ_ρ = saturation smoothing`, `σ_θ = hue
  smoothing`.
- **Pixels.** `lut3d.c`'s tetrahedral, trilinear and pyramid interpolations,
  the input clamped to the cube with the excess restored afterwards.

### How it maps onto SafeLight

One stage in SafeLight's scene-linear phase (Ansel places the module after
colour balance and before filmic), built on the stage/prepass framework:

- **Two draws build the table.** An *anchors* draw evaluates the nine curves
  from their nodes and writes the 192 ring anchors (two texels each); a
  *lattice* draw writes the displacement of every lattice point — read from the
  pixel's own colour, so the table is a colour map, never a pixel map — plus a
  marker texel. SafeLight caches a prepass result until one of its pass keys
  changes, so dragging a node rebuilds the table (about two milliseconds of
  work at level 64) and everything else — white level, interpolation, other
  panels, pan and zoom — is a cache hit.
- **The inline block** takes each pixel's live scene-linear value (after
  exposure and white balance) to HLG Rec2020, interpolates the table with
  `textureSize` / `texelFetch` on the host's prepass result sampler, and comes
  back.
- **The table's level adapts to the frame** the prepass renders at: 64
  whenever the frame has at least 262144 texels (any Develop or export render),
  smaller only for tiny renders — the same integer arithmetic on the CPU and in
  GLSL.
- **The marker texel** guards every way the sampler can hold something other
  than this table (the stage starved of a prepass unit, a failing pass, an
  8-bit target): the pixel then passes through untouched.
- The curve nodes are the edit and the GPU data at once — ten `vec4` chunks
  and a count per curve, nothing stored twice — and the `on` gate, derived from
  them, keeps an untouched photo bit-exact.

Differences from Ansel to be aware of:

- SafeLight's working space has sRGB primaries; pixels reach Rec2020 through
  darktable's Bradford D50 sRGB matrix and the profile's matrix, the same
  composition Ansel's work → HLG hop makes.
- The HLG curves are analytic in both directions. Ansel evaluates a
  4096-point table on [0, 1] with a power-law fit above 1, so the two agree to
  about 1e-5 in code values inside the range and differ only for pixels
  brighter than the white level. Below black both clip to 0.
- Ansel's hue-shift path divides 0/0 when a brightness curve reaches exactly
  zero; the port maps that to black instead. Ansel also lets a node be added
  within 0.01 of the first node across the wrap (and exactly on it at x = 1),
  which breaks the seam; the port refuses those, as Ansel itself does when
  moving an end node.
- Small renders take a smaller table level; the field is smooth, so the
  difference is far below what a thumbnail shows.
- The picker and the on-image marker read display-referred captures (the
  photo rendered with this stage bypassed for the input, the live view for the
  output); Ansel reads its scene-linear pipe input. Hue survives the tone
  transform closely enough for the graph; the brightness reading is a guide.
- The LUT viewer, the white-level picker and Ansel's white-level auto-set are
  not ported (the latter two read the scene-linear pipe input, which extensions
  cannot see). The picker is point-only.
- Ctrl is the app's pan/zoom passthrough, so the fine wheel step is Alt.
- The table needs SafeLight's float render targets (`EXT_color_buffer_float`,
  present on every desktop GPU); on the 8-bit fallback the stage passes pixels
  through.

### Tests

`npm test` runs on the CPU against vectors generated from Ansel's own code
(`test/reference/ansel_ref.cpp`, built with g++ by `npm run test:reference`;
the JSON is committed): the spline, the UCS and profile paths, the reference
saturations, the anchors, the field at 600 lattice points, a full level-16
table, the three interpolations inside and outside the cube, and end-to-end
pixels through a level-32 table for three parameter sets; the bag bridge; the
stage contracts with a **per-draw texture-fetch budget** on the real GLSL; the
graph geometry; the sampler's scheduling; the activation contract; and the
panel and graph rendered without a DOM, in the dock and inside a mask.

`npm run test:gpu` runs the stage through a SafeLight checkout's WebGL harness
(headless Chromium on SwiftShader): the passes and the inline compile, the
defaults are a bit-exact no-op, and on a hue-sweep scene the render matches
Ansel's `process()` for three parameter sets and all three interpolations to
0.4–0.6 % of the change with no sample off by more than 2e-3, at the table
level a 256² frame affords and again at the level a 96×64 frame affords; a
mask over the right half builds its own table there and leaves the left half
bit-identical. It needs the SafeLight repository beside this one (or `SAFELIGHT_CORE=<path>`)
with its dev dependencies installed.

## Install

Install from the SafeLight **Extensions** window, or load this folder via
Developer Tools ▸ Extensions during development. A **Colour Equaliser** panel
appears in Develop (right dock). Build from source with `npm install && npm run
build` (outputs `dist/index.js`). Needs SafeLight 3.1.0 or later.

## License & credits

**GPL-3.0-or-later.** The algorithm, the colour science and the UI are a
reimplementation of Ansel's colour equalizer, which is GPL-3.0; this extension
is licensed under the GPL to respect that.

- Ansel and its colour equalizer are © Aurélien Pierre —
  [aurelienpierreeng/ansel](https://github.com/aurelienpierreeng/ansel).
- darktable UCS 22 is © Aurélien Pierre; the CAT16 matrices and the D50 sRGB
  matrices come from darktable's `colorspaces_inline_conversions.h` and
  `chromatic_adaptation.h` — [darktable-org/darktable](https://github.com/darktable-org/darktable).
- The periodic monotone Hermite spline is darktable's `math/splines.cpp`
  (© Heiko Bauke, Pascal Obry and contributors) over `common/curve_tools.h`
  (© Jochen Schroeder, johannes hanika and contributors, based on UFraw's
  nikon_curve by Shawn Freeman and Udi Fuchs); the reference harness vendors
  them verbatim.
- The UCS transcription started from the Colour Harmony port's `ucs.ts`.

This is an independent port and is not affiliated with or endorsed by the
Ansel or darktable projects.
