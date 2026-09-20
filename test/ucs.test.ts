// The colour paths against Ansel's own numbers: dt UCS HSB to XYZ D65, to
// HLG Rec2020 code values (the table's domain), to the unclamped sRGB probe
// the reference saturation search uses, and to the display gradient; plus the
// HLG pair and the Rec2020 matrix construction.

import { describe, expect, it } from "vitest";
import {
  CAT16_D65_TO_D50,
  HLG,
  REC2020_TO_XYZ_D50,
  XYZ_D50_TO_REC2020,
  apply3,
  hlgEotf,
  hlgOetf,
  hsbToDisplaySrgb,
  hsbToJch,
  hsbToLutRgb,
  hsbToPreviewSrgb,
  hsbToXyzD65,
  jchToHsb,
  linearSrgbToHsb,
} from "../src/ucs";
import { V, closeTo } from "./support/vectors";

const TOL = 1e-5;

describe("dt UCS HSB paths", () => {
  it("reach XYZ D65 as Ansel's dt_UCS_HSB_to_XYZ", () => {
    for (const s of V.hsb) expect(closeTo(hsbToXyzD65(s.hsb), s.xyz, TOL)).toBe(true);
  });

  it("reach HLG Rec2020 code values as dt_colorrings_hsb_to_profile_rgb", () => {
    for (const s of V.hsb) expect(closeTo(hsbToLutRgb(s.hsb), s.lutRgb, TOL)).toBe(true);
  });

  it("reach the unclamped sRGB probe of the reference-saturation search", () => {
    for (const s of V.hsb) expect(closeTo(hsbToPreviewSrgb(s.hsb), s.previewSrgb, TOL)).toBe(true);
  });

  it("reach the normalised display sRGB of the graph gradients", () => {
    for (const s of V.hsb) expect(closeTo(hsbToDisplaySrgb(s.hsb), s.displaySrgb, TOL)).toBe(true);
  });

  it("round-trips HSB through JCH", () => {
    const hsb = [1.2, 0.09, 0.45] as const;
    expect(closeTo(jchToHsb(hsbToJch(hsb)), hsb, 1e-12)).toBe(true);
  });

  it("reads a grey as unsaturated", () => {
    expect(linearSrgbToHsb([0.2, 0.2, 0.2])[1]).toBeLessThan(1e-4);
    expect(linearSrgbToHsb([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("HLG", () => {
  it("maps diffuse white to code 1 and 1/12 to 0.5", () => {
    expect(Math.abs(hlgOetf(1) - 1)).toBeLessThan(1e-5);
    expect(hlgOetf(1 / 12)).toBe(0.5);
    expect(HLG.a).toBe(0.17883277);
  });

  it("inverts itself, and clips below black like Ansel's table", () => {
    for (const x of [0.001, 0.05, 0.3, 1, 2.5]) expect(Math.abs(hlgEotf(hlgOetf(x)) - x)).toBeLessThan(1e-9 * Math.max(1, x));
    expect(hlgOetf(-0.1)).toBe(0);
    expect(hlgEotf(-0.1)).toBe(0);
  });
});

describe("matrices", () => {
  it("builds the Bradford-adapted Rec2020 matrix lcms builds", () => {
    // Rec2020 white lands on lcms's D50 exactly; the entries are pinned so a
    // change in the construction shows up.
    expect(closeTo(apply3(REC2020_TO_XYZ_D50, [1, 1, 1]), [0.9642, 1, 0.8249], 1e-12)).toBe(true);
    const pinned = [0.67348, 0.1656714, 0.1250487, 0.2790425, 0.6753446, 0.0456129, -0.0019334, 0.0299828, 0.7968507];
    expect(closeTo(REC2020_TO_XYZ_D50, pinned, 1e-7)).toBe(true);
    const v = [0.2, 0.5, 0.9] as const;
    expect(closeTo(apply3(XYZ_D50_TO_REC2020, apply3(REC2020_TO_XYZ_D50, v)), v, 1e-9)).toBe(true);
  });

  it("carries darktable's CAT16 D65 → D50 rows", () => {
    expect(CAT16_D65_TO_D50[0]).toBe(1.01085433);
    expect(CAT16_D65_TO_D50[8]).toBe(0.767964947);
  });
});
