// darktable UCS 22 (JCH / HSB) and the colour paths Ansel's colour equalizer
// takes around it. The UCS functions, the CAT16 matrices and the D50 sRGB
// matrices are transcribed from darktable's colorspaces_inline_conversions.h
// and chromatic_adaptation.h (© Aurélien Pierre / the darktable developers,
// GPL-3.0-or-later); the paths from Ansel's pixel/colorequal_shared.c
// (© Aurélien Pierre). Every constant is exported so the GLSL in glsl.ts is
// formatted from the same numbers and cannot drift from this CPU reference.
//
// Ansel converts dt UCS (D65) to its D50-referenced profiles with CAT16 and
// reads the profiles' own Bradford-adapted matrices; the port keeps that mix
// so its ring anchors land where Ansel's do.

export type Vec3 = readonly [number, number, number];
/** Row-major 3×3. */
export type Mat3 = readonly number[];

export function apply3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) out.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  }
  return out;
}

export function inv3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
}

// ── Matrices ─────────────────────────────────────────────────────────────────

/** Lindbloom's D65 sRGB matrices, as darktable's dt_XYZ_to_Rec709_D65. */
export const SRGB_TO_XYZ_D65: Mat3 = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.072175,
  0.0193339, 0.119192, 0.9503041,
];
export const XYZ_TO_SRGB_D65: Mat3 = [
  3.2404542, -1.5371385, -0.4985314,
  -0.969266, 1.8760108, 0.041556,
  0.0556434, -0.2040259, 1.0572252,
];

/** darktable's Bradford-adapted D50 sRGB matrices (dt_Rec709_to_XYZ_D50,
 *  dt_XYZ_to_Rec709_D50). */
export const SRGB_TO_XYZ_D50: Mat3 = [
  0.4360747, 0.3850649, 0.1430804,
  0.2225045, 0.7168786, 0.0606169,
  0.0139322, 0.0971045, 0.7141733,
];
export const XYZ_D50_TO_SRGB: Mat3 = [
  3.1338561, -1.6168667, -0.4906146,
  -0.9787684, 1.9161415, 0.033454,
  0.0719453, -0.2289914, 1.4052427,
];

/** darktable's CAT16 adaptations (chromatic_adaptation.h). */
export const CAT16_D65_TO_D50: Mat3 = [
  1.01085433, 0.0407086103, -0.0341445825,
  0.00542814201, 0.993581926, 0.00115592039,
  0.000250722468, -0.0114918759, 0.767964947,
];
export const CAT16_D50_TO_D65: Mat3 = [
  0.989466254, -0.0400304626, 0.0440530317,
  -0.00540518733, 1.00666069, -0.00175551955,
  -0.000403920992, 0.015076803, 1.30210211,
];

export const REC2020_PRIMARIES: readonly [number, number][] = [
  [0.708, 0.292],
  [0.17, 0.797],
  [0.131, 0.046],
];
/** Ansel's D65xyY. */
export const D65_WHITE_XY: readonly [number, number] = [0.312700492, 0.329000939];
const BRADFORD: Mat3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
/** lcms's cmsD50_XYZ. */
const D50_XYZ: Vec3 = [0.9642, 1.0, 0.8249];

/** The RGB → XYZ D50 matrix lcms writes into a profile built from xy
 *  primaries and a white: the primaries scaled to the white, then adapted to
 *  D50 with Bradford (_cmsBuildRGB2XYZtransferMatrix, _cmsAdaptationMatrix). */
export function bradfordAdaptedRgbToXyzD50(
  primaries: readonly [number, number][],
  white: readonly [number, number],
): Mat3 {
  const [[xr, yr], [xg, yg], [xb, yb]] = primaries;
  const prim: Mat3 = [xr / yr, xg / yg, xb / yb, 1, 1, 1, (1 - xr - yr) / yr, (1 - xg - yg) / yg, (1 - xb - yb) / yb];
  const W: Vec3 = [white[0] / white[1], 1, (1 - white[0] - white[1]) / white[1]];
  const S = apply3(inv3(prim), W);
  const rgbToXyz: Mat3 = prim.map((v, i) => v * S[i % 3]);
  const src = apply3(BRADFORD, W);
  const dst = apply3(BRADFORD, D50_XYZ);
  const scaled: Mat3 = BRADFORD.map((v, i) => (dst[Math.floor(i / 3)] / src[Math.floor(i / 3)]) * v);
  return mul3(mul3(inv3(BRADFORD), scaled), rgbToXyz);
}

export const REC2020_TO_XYZ_D50: Mat3 = bradfordAdaptedRgbToXyzD50(REC2020_PRIMARIES, D65_WHITE_XY);
export const XYZ_D50_TO_REC2020: Mat3 = inv3(REC2020_TO_XYZ_D50);
/** The pixel path: Safelight's linear sRGB to linear Rec2020, through the
 *  two Bradford D50 matrices as Ansel's work → HLG profile hop composes. */
export const SRGB_TO_REC2020: Mat3 = mul3(XYZ_D50_TO_REC2020, SRGB_TO_XYZ_D50);
export const REC2020_TO_SRGB: Mat3 = mul3(XYZ_D50_TO_SRGB, REC2020_TO_XYZ_D50);

// ── HLG (BT.2100) ────────────────────────────────────────────────────────────

export const HLG = { a: 0.17883277, b: 0.28466892, c: 0.55991073 } as const;

/** Linear light → code value. Below black Ansel's table clips to 0; above
 *  diffuse white the standard's log segment continues (Ansel fits a power
 *  law there). */
export function hlgOetf(E: number): number {
  if (E <= 0) return 0;
  if (E <= 1 / 12) return Math.sqrt(3 * E);
  return HLG.a * Math.log(12 * E - HLG.b) + HLG.c;
}

/** Code value → linear light, the inverse of hlgOetf. */
export function hlgEotf(e: number): number {
  if (e <= 0) return 0;
  if (e <= 0.5) return (e * e) / 3;
  return (Math.exp((e - HLG.c) / HLG.a) + HLG.b) / 12;
}

// ── darktable UCS 22 ─────────────────────────────────────────────────────────

export const UCS_L_STAR_RANGE = 2.098883786377;
export const UCS_L_STAR_EXPONENT = 0.631651345306265;
export const UCS_L_STAR_OFFSET = 1.12426773749357;
export const UCS_L_STAR_INVERSE_EXPONENT = 1.5831518565279648;
export const UCS_CHROMA_SCALE = 15.932993652962535;
export const UCS_CHROMA_L_EXPONENT = 0.6523997524738018;
export const UCS_CHROMA_M_EXPONENT = 0.6007557017508491;
export const UCS_CHROMA_INVERSE_EXPONENT = 0.8322850678616855;
export const UCS_HSB_EXPONENT = 1.33654221029386;

export const UCS_UV_X_FACTORS: Vec3 = [-0.783941002840055, 0.745273540913283, 0.318707282433486];
export const UCS_UV_Y_FACTORS: Vec3 = [0.277512987809202, -0.205375866083878, 2.16743692732158];
export const UCS_UV_OFFSETS: Vec3 = [0.153836578598858, -0.165478376301988, 0.291320554395942];
export const UCS_UV_FACTORS: readonly [number, number] = [1.39656225667, 1.4513954287];
export const UCS_UV_HALF: readonly [number, number] = [1.49217352929, 1.52488637914];
/** UV* → UV*' as a row-major 2×2. */
export const UCS_UV_PRIME: readonly number[] = [-1.124983854323892, -0.980483721769325, 1.86323315098672, 1.971853092390862];
/** UV*' → UV*, the inverse as darktable writes it. */
export const UCS_UV_UNPRIME: readonly number[] = [-5.037522385190711, -2.504856328185843, 4.760029407436461, 2.874012963239247];
export const UCS_XY_U_FACTORS: Vec3 = [0.167171472114775, -0.150959086409163, 0.940254742367256];
export const UCS_XY_V_FACTORS: Vec3 = [0.141299802443708, -0.155185060382272, 1.0];
export const UCS_XY_OFFSETS: Vec3 = [-0.00801531300850582, -0.00843312433578007, -0.0256325967652889];

export const FLT_EPSILON = 1.1920929e-7;
export const FLT_MIN = 1.17549435e-38;

export function yToLStar(Y: number): number {
  const yHat = Math.pow(Y, UCS_L_STAR_EXPONENT);
  return (UCS_L_STAR_RANGE * yHat) / (yHat + UCS_L_STAR_OFFSET);
}

export function lStarToY(L: number): number {
  return Math.pow((UCS_L_STAR_OFFSET * L) / (UCS_L_STAR_RANGE - L), UCS_L_STAR_INVERSE_EXPONENT);
}

/** dt_colorrings_graph_white: the lightness of diffuse white. */
export const L_WHITE = yToLStar(1);

export function xyzToXyY(xyz: Vec3): Vec3 {
  const sum = xyz[0] + xyz[1] + xyz[2];
  return [xyz[0] / sum, xyz[1] / sum, xyz[1]];
}

export function xyYToXyz(xyY: Vec3): Vec3 {
  const [x, y, Y] = xyY;
  if (y === 0) return [0, 0, 0];
  return [(Y * x) / y, Y, (Y * (1 - x - y)) / y];
}

function safeDivisor(d: number): number {
  return d >= 0 ? Math.max(FLT_MIN, d) : Math.min(-FLT_MIN, d);
}

/** xyY (D65) → J C H, H in radians (−π, π]. */
export function xyYToJch(xyY: Vec3): Vec3 {
  const uvd = [0, 0, 0];
  for (let c = 0; c < 3; c++) uvd[c] = UCS_UV_X_FACTORS[c] * xyY[0] + UCS_UV_Y_FACTORS[c] * xyY[1] + UCS_UV_OFFSETS[c];
  const div = safeDivisor(uvd[2]);
  const u = uvd[0] / div;
  const v = uvd[1] / div;
  const uStar = (UCS_UV_FACTORS[0] * u) / (Math.abs(u) + UCS_UV_HALF[0]);
  const vStar = (UCS_UV_FACTORS[1] * v) / (Math.abs(v) + UCS_UV_HALF[1]);
  const up = UCS_UV_PRIME[0] * uStar + UCS_UV_PRIME[1] * vStar;
  const vp = UCS_UV_PRIME[2] * uStar + UCS_UV_PRIME[3] * vStar;
  const L = yToLStar(xyY[2]);
  const m2 = up * up + vp * vp;
  return [
    L / L_WHITE,
    (UCS_CHROMA_SCALE * Math.pow(L, UCS_CHROMA_L_EXPONENT) * Math.pow(m2, UCS_CHROMA_M_EXPONENT)) / L_WHITE,
    Math.atan2(vp, up),
  ];
}

/** J C H → xyY (D65). Black (L* = 0) maps to black rather than 0/0. */
export function jchToXyY(jch: Vec3): Vec3 {
  const L = jch[0] * L_WHITE;
  const M =
    L > 0
      ? Math.pow((jch[1] * L_WHITE) / (UCS_CHROMA_SCALE * Math.pow(L, UCS_CHROMA_L_EXPONENT)), UCS_CHROMA_INVERSE_EXPONENT)
      : 0;
  const up = M * Math.cos(jch[2]);
  const vp = M * Math.sin(jch[2]);
  const uStar = UCS_UV_UNPRIME[0] * up + UCS_UV_UNPRIME[1] * vp;
  const vStar = UCS_UV_UNPRIME[2] * up + UCS_UV_UNPRIME[3] * vp;
  const u = (-UCS_UV_HALF[0] * uStar) / (Math.abs(uStar) - UCS_UV_FACTORS[0]);
  const v = (-UCS_UV_HALF[1] * vStar) / (Math.abs(vStar) - UCS_UV_FACTORS[1]);
  const xyD = [0, 0, 0];
  for (let c = 0; c < 3; c++) xyD[c] = UCS_XY_U_FACTORS[c] * u + UCS_XY_V_FACTORS[c] * v + UCS_XY_OFFSETS[c];
  const div = safeDivisor(xyD[2]);
  return [xyD[0] / div, xyD[1] / div, L > 0 ? lStarToY(L) : 0];
}

/** dt_UCS_JCH_to_HSB → [H, S, B]. */
export function jchToHsb(jch: Vec3): Vec3 {
  const B = jch[0] * (Math.pow(jch[1], UCS_HSB_EXPONENT) + 1);
  return [jch[2], B > 0 ? jch[1] / B : 0, B];
}

/** dt_UCS_HSB_to_JCH → [J, C, H]. */
export function hsbToJch(hsb: Vec3): Vec3 {
  const C = hsb[1] * hsb[2];
  return [hsb[2] / (Math.pow(C, UCS_HSB_EXPONENT) + 1), C, hsb[0]];
}

/** dt_UCS_HSB_to_XYZ at the graph white. */
export function hsbToXyzD65(hsb: Vec3): Vec3 {
  return xyYToXyz(jchToXyY(hsbToJch(hsb)));
}

function xyzD65ToD50(xyz: Vec3): Vec3 {
  return apply3(CAT16_D65_TO_D50, xyz);
}

/** dt_colorrings_hsb_to_profile_rgb for the HLG Rec2020 profile: the table's
 *  code values. */
export function hsbToLutRgb(hsb: Vec3): Vec3 {
  const lin = apply3(XYZ_D50_TO_REC2020, xyzD65ToD50(hsbToXyzD65(hsb)));
  return [hlgOetf(lin[0]), hlgOetf(lin[1]), hlgOetf(lin[2])];
}

function srgbEncodeUnclamped(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** _dt_ucs_hsb_to_preview_rgb_unclamped: the sRGB probe the reference
 *  saturation search tests against [0, 1]. */
export function hsbToPreviewSrgb(hsb: Vec3): Vec3 {
  const lin = apply3(XYZ_D50_TO_SRGB, xyzD65ToD50(hsbToXyzD65(hsb)));
  return [srgbEncodeUnclamped(lin[0]), srgbEncodeUnclamped(lin[1]), srgbEncodeUnclamped(lin[2])];
}

/** dt_colorrings_hsb_to_display_rgb on an sRGB display: out-of-range linear
 *  values compressed by their max channel, encoded, clamped — the graph
 *  gradients. */
export function hsbToDisplaySrgb(hsb: Vec3): Vec3 {
  let lin = apply3(XYZ_D50_TO_SRGB, xyzD65ToD50(hsbToXyzD65(hsb)));
  const max = Math.max(lin[0], lin[1], lin[2]);
  if (lin[0] > 1 || lin[1] > 1 || lin[2] > 1) lin = [lin[0] / max, lin[1] / max, lin[2] / max];
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return [clamp01(srgbEncodeUnclamped(lin[0])), clamp01(srgbEncodeUnclamped(lin[1])), clamp01(srgbEncodeUnclamped(lin[2]))];
}

/** dt_colorrings_profile_rgb_to_dt_ucs_jch with an sRGB profile: black and
 *  near-black read as zero rather than 0/0. */
export function linearSrgbToJch(rgb: Vec3): Vec3 {
  const d65 = apply3(CAT16_D50_TO_D65, apply3(SRGB_TO_XYZ_D50, rgb));
  const xyz: Vec3 = [Math.max(d65[0], 0), Math.max(d65[1], 0), Math.max(d65[2], 0)];
  if (xyz[0] + xyz[1] + xyz[2] <= 1e-6) return [0, 0, 0];
  return xyYToJch(xyzToXyY(xyz));
}

/** The inverse of linearSrgbToJch. */
export function jchToLinearSrgb(jch: Vec3): Vec3 {
  return apply3(XYZ_D50_TO_SRGB, xyzD65ToD50(xyYToXyz(jchToXyY(jch))));
}

export function linearSrgbToHsb(rgb: Vec3): Vec3 {
  return jchToHsb(linearSrgbToJch(rgb));
}

// ── sRGB transfer and HSV, for samples and test scenes ───────────────────────

export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** darktable's dt_HSV_2_RGB. */
export function hsvToRgb(h: number, s: number, v: number): Vec3 {
  const C = s * v;
  const m = v - C;
  const hh = h * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const fc = f * C;
  const top = C + m;
  const dec = C - fc + m;
  const inc = fc + m;
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [top, inc, m];
    case 1:
      return [dec, top, m];
    case 2:
      return [m, top, inc];
    case 3:
      return [m, dec, top];
    case 4:
      return [inc, m, top];
    default:
      return [top, m, dec];
  }
}
