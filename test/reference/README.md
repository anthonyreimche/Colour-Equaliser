# Reference vectors

`ansel_ref.cpp` is Ansel's own code (master, September 2026, © Aurélien Pierre,
GPL-3.0-or-later), kept in single precision as Ansel runs it:

- `splines.cpp`, `math/splines.h` and `common/curve_tools.h` are vendored
  verbatim — the periodic monotone Hermite spline the hue curves use;
- the darktable UCS 22 conversions, the CAT16 adaptation matrices and the
  D50 sRGB matrices from `colorspaces_inline_conversions.h` and
  `chromatic_adaptation.h`;
- the ring, cube-shell, grey-cylindrical, Wendland, local-field and table
  functions from `pixel/colorequal_shared.c`, and `pixel/lut3d.c`;
- the anchor loop of `_build_clut` and the pixel path of `process()` from
  `iop/colorequal.c`.

`build.cjs` compiles it with g++ and writes `vectors.json`; the tests read the
JSON, so a machine without a compiler still runs the suite. Regenerate with
`npm run test:reference` after touching the C++.

Two deliberate departures from Ansel, both shared by the extension:

- The "HLG Rec2020 RGB" profile is not read from lcms. Its matrix is computed
  the way lcms builds it (Rec2020 primaries and D65 white, Bradford-adapted
  to D50) and its curve is the analytic BT.2100 HLG pair; Ansel evaluates a
  4096-point table on [0, 1] with a power-law fit above 1, so the two agree to
  about 1e-5 in code values inside the unit range and differ above white.
- The working space is Safelight's linear sRGB, reached through darktable's
  Bradford D50 sRGB matrices, where Ansel would use the pipe's work profile.
