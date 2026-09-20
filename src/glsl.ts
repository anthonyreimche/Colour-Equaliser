// The GLSL helpers of the stage, formatted from the model's constants so the
// shader and the CPU reference cannot drift apart. Functions only: the host
// splices helpers into one fragment shader and namespaces function names, so a
// global constant would be declared twice. Nothing here names the host's
// prepass result sampler; the lookup helpers take it as a parameter.
//
// Loops use literal bounds with early breaks and the wraps are arithmetic:
// the fetch-budget analyser in the tests reads this text and refuses loop
// forms it cannot bound.

import { CHANNELS, MAX_NODES } from "./curve";
import { MAX_LUT_LEVEL } from "./field";
import { CHANNEL_KEY, CHUNKS } from "./params";
import { AXIS_SAMPLES, HUE_SAMPLES, REFERENCE_SATURATION, RINGS, RING_BRIGHTNESS, axisRgb } from "./rings";
import {
  CAT16_D65_TO_D50,
  FLT_EPSILON,
  FLT_MIN,
  HLG,
  L_WHITE,
  REC2020_TO_SRGB,
  SRGB_TO_REC2020,
  UCS_CHROMA_INVERSE_EXPONENT,
  UCS_CHROMA_L_EXPONENT,
  UCS_CHROMA_SCALE,
  UCS_HSB_EXPONENT,
  UCS_L_STAR_INVERSE_EXPONENT,
  UCS_L_STAR_OFFSET,
  UCS_L_STAR_RANGE,
  UCS_UV_FACTORS,
  UCS_UV_HALF,
  UCS_UV_UNPRIME,
  UCS_XY_OFFSETS,
  UCS_XY_U_FACTORS,
  UCS_XY_V_FACTORS,
  XYZ_D50_TO_REC2020,
} from "./ucs";

/** A GLSL float literal at full single precision, always with a decimal
 *  point (GLSL ES never promotes an integer literal to float). */
export function glslLiteral(v: number): string {
  const s = v.toPrecision(10);
  if (!s.includes("e")) return s.includes(".") ? s : `${s}.0`;
  const [mantissa, exponent] = s.split("e");
  return `${mantissa.includes(".") ? mantissa : `${mantissa}.0`}e${exponent}`;
}

const lit = glslLiteral;
const vec2 = (v: readonly number[]) => `vec2(${v.map(lit).join(", ")})`;
const vec3 = (v: readonly number[]) => `vec3(${v.map(lit).join(", ")})`;
/** A row-major 3×3 as a GLSL mat3 constructor (column-major arguments). */
const mat3 = (m: readonly number[]) => `mat3(${[0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => lit(m[i])).join(", ")})`;

const PI = lit(Math.PI);
const TWO_PI = lit(2 * Math.PI);

// ── Colour: dt UCS HSB → HLG Rec2020, HLG both ways, the cube frame ────────

export const COLOUR_GLSL = `
float ceYOfLStar(float L) {
  return pow(${lit(UCS_L_STAR_OFFSET)} * L / (${lit(UCS_L_STAR_RANGE)} - L), ${lit(UCS_L_STAR_INVERSE_EXPONENT)});
}
float ceSafeDiv(float d) { return d >= 0.0 ? max(${lit(FLT_MIN)}, d) : min(-${lit(FLT_MIN)}, d); }
float ceWrap2Pi(float h) { return h - ${TWO_PI} * floor(h / ${TWO_PI}); }
float ceWrapHuePi(float h) { return ceWrap2Pi(h + ${PI}) - ${PI}; }
float ceWrapPi(float x) { return x - ${TWO_PI} * floor((x + ${PI}) / ${TWO_PI}); }
// (J, C, H radians) -> xyY D65; black stays black rather than 0/0.
vec3 ceJchToXyY(vec3 jch) {
  float L = jch.x * ${lit(L_WHITE)};
  float M = L > 0.0
    ? pow(jch.y * ${lit(L_WHITE)} / (${lit(UCS_CHROMA_SCALE)} * pow(L, ${lit(UCS_CHROMA_L_EXPONENT)})), ${lit(UCS_CHROMA_INVERSE_EXPONENT)})
    : 0.0;
  vec2 p = M * vec2(cos(jch.z), sin(jch.z));
  vec2 uvs = vec2(${lit(UCS_UV_UNPRIME[0])} * p.x + ${lit(UCS_UV_UNPRIME[1])} * p.y,
                  ${lit(UCS_UV_UNPRIME[2])} * p.x + ${lit(UCS_UV_UNPRIME[3])} * p.y);
  vec2 uv = -${vec2(UCS_UV_HALF)} * uvs / (abs(uvs) - ${vec2(UCS_UV_FACTORS)});
  vec3 xyD = ${vec3(UCS_XY_U_FACTORS)} * uv.x + ${vec3(UCS_XY_V_FACTORS)} * uv.y + ${vec3(UCS_XY_OFFSETS)};
  return vec3(xyD.xy / ceSafeDiv(xyD.z), L > 0.0 ? ceYOfLStar(L) : 0.0);
}
vec3 ceXyYToXyz(vec3 xyY) {
  if (xyY.y == 0.0) return vec3(0.0);
  return vec3(xyY.z * xyY.x / xyY.y, xyY.z, xyY.z * (1.0 - xyY.x - xyY.y) / xyY.y);
}
// (H radians, S, B) -> XYZ D65 at the graph white.
vec3 ceHsbToXyz(vec3 hsb) {
  float C = hsb.y * hsb.z;
  return ceXyYToXyz(ceJchToXyY(vec3(hsb.z / (pow(C, ${lit(UCS_HSB_EXPONENT)}) + 1.0), C, hsb.x)));
}
float ceHlgOetf1(float E) {
  if (E <= 0.0) return 0.0;
  if (E <= ${lit(1 / 12)}) return sqrt(3.0 * E);
  return ${lit(HLG.a)} * log(12.0 * E - ${lit(HLG.b)}) + ${lit(HLG.c)};
}
vec3 ceHlgOetf(vec3 E) { return vec3(ceHlgOetf1(E.x), ceHlgOetf1(E.y), ceHlgOetf1(E.z)); }
float ceHlgEotf1(float e) {
  if (e <= 0.0) return 0.0;
  if (e <= 0.5) return e * e / 3.0;
  return (exp((e - ${lit(HLG.c)}) / ${lit(HLG.a)}) + ${lit(HLG.b)}) / 12.0;
}
vec3 ceHlgEotf(vec3 e) { return vec3(ceHlgEotf1(e.x), ceHlgEotf1(e.y), ceHlgEotf1(e.z)); }
// XYZ D65 -> the table's code values: CAT16 to D50, the profile's matrix, HLG.
vec3 ceXyzToLutRgb(vec3 xyz) {
  const mat3 cat16 = ${mat3(CAT16_D65_TO_D50)};
  const mat3 toRec2020 = ${mat3(XYZ_D50_TO_REC2020)};
  return ceHlgOetf(toRec2020 * (cat16 * xyz));
}
vec3 ceHsbToLutRgb(vec3 hsb) { return ceXyzToLutRgb(ceHsbToXyz(hsb)); }
// The grey-cylindrical frame: (L along the diagonal, rho, theta).
vec3 ceGrayCyl(vec3 rgb) {
  float L = (rgb.r + rgb.g + rgb.b) * ${lit(0.5773502691896258)};
  float u = (rgb.r - rgb.g) * ${lit(0.7071067811865475)};
  float v = (rgb.r + rgb.g) * ${lit(0.408248290463863)} + rgb.b * ${lit(-0.816496580927726)};
  return vec3(L, sqrt(u * u + v * v), atan(v, u));
}
vec3 ceGrayToRgb(float L, float u, float v) {
  float grey = L * ${lit(0.5773502691896258)};
  float du = u * ${lit(0.7071067811865475)};
  float dv = v * ${lit(0.408248290463863)};
  return vec3(grey + du + dv, grey - du + dv, grey + v * ${lit(-0.816496580927726)});
}
float ceShellDistance(vec3 axis, vec3 dir) {
  float distance = 1.0e30;
  for (int c = 0; c < 3; c++) {
    if (abs(dir[c]) < 1e-6) continue;
    float bound = dir[c] > 0.0 ? 1.0 : 0.0;
    float candidate = (bound - axis[c]) / dir[c];
    if (candidate > 0.0 && candidate < distance) distance = candidate;
  }
  return distance >= 1.0e30 ? 0.0 : distance;
}
// Keep a colour inside the unit cube along the ray from a grey on the diagonal.
vec3 ceShell(vec3 axis, vec3 rgb) {
  vec3 v = rgb - axis;
  if (length(v) < 1e-6) return rgb;
  float s = ceShellDistance(axis, v);
  if (s < 1.0) rgb = axis + s * v;
  return clamp(rgb, 0.0, 1.0);
}
float ceWendland(float d) {
  if (d >= 1.0) return 0.0;
  float t = 1.0 - d;
  return t * t * t * t * (4.0 * d + 1.0);
}
`;

// ── Rings and curves ─────────────────────────────────────────────────────────

const ringSelect = (name: string, values: readonly number[]) =>
  `float ${name}(int ring) { return ring == 0 ? ${lit(values[0])} : (ring == 1 ? ${lit(values[1])} : ${lit(values[2])}); }`;

export const RING_GLSL = `
${ringSelect("ceRingBrightness", RINGS.map((r) => RING_BRIGHTNESS[r]))}
${ringSelect("ceRefSat", RINGS.map((r) => REFERENCE_SATURATION[r]))}
${ringSelect("ceAxisRgb", RINGS.map((r) => axisRgb(RING_BRIGHTNESS[r])))}
float ceCurveXToHue(float x) { return ceWrapHuePi((360.0 * x + ${lit(20)}) * ${PI} / 180.0); }
// Channel 2 (hue) reads a shift in radians; 0 and 1 (saturation, brightness) a gain in [0, 2].
float ceChannelValue(int channel, float y) {
  return channel == 2 ? (y - 0.5) * ${TWO_PI} : clamp(y * 2.0, 0.0, 2.0);
}
`;

const curveIndex = RINGS.flatMap((ring) => CHANNELS.map((channel) => `${ring}${CHANNEL_KEY[channel]}`));

const chunkList = (name: string) =>
  `vec4[${CHUNKS}](${Array.from({ length: CHUNKS }, (_, c) => `${name}${c}`).join(", ")})`;

const curveSwitch = curveIndex
  .map((name, i) => `${i === 0 ? "if" : "else if"} (curve == ${i}) { n = ${chunkList(name)}; count = ${name}Count; }`)
  .join("\n  ");

export const CURVE_GLSL = `
// Node k of a curve packed two per vec4.
vec2 ceNode(vec4 n[${CHUNKS}], int k) {
  vec4 c = n[k / 2];
  return (k - 2 * (k / 2)) == 0 ? c.xy : c.zw;
}
// Ansel's periodic monotone Hermite spline (period 1) over sorted nodes.
float ceHermite(vec4 n[${CHUNKS}], int count, float x) {
  float px[${MAX_NODES}];
  float py[${MAX_NODES}];
  float D[${MAX_NODES}];
  float dy[${MAX_NODES}];
  for (int k = 0; k < ${MAX_NODES}; k++) {
    if (k >= count) break;
    vec2 p = ceNode(n, k);
    px[k] = p.x;
    py[k] = p.y;
  }
  for (int k = 0; k < ${MAX_NODES}; k++) {
    if (k >= count - 1) break;
    D[k] = (py[k + 1] - py[k]) / (px[k + 1] - px[k]);
  }
  D[count - 1] = (py[0] - py[count - 1]) / (px[0] - px[count - 1] + 1.0);
  dy[0] = D[count - 1] * D[0] <= 0.0 ? 0.0 : (D[count - 1] + D[0]) * 0.5;
  for (int k = 1; k < ${MAX_NODES}; k++) {
    if (k >= count) break;
    dy[k] = D[k - 1] * D[k] <= 0.0 ? 0.0 : (D[k - 1] + D[k]) * 0.5;
  }
  for (int k = 0; k < ${MAX_NODES}; k++) {
    if (k >= count) break;
    int k1 = k + 1 < count ? k + 1 : 0;
    if (abs(D[k]) < ${lit(FLT_EPSILON)}) {
      dy[k] = 0.0;
      dy[k1] = 0.0;
    } else {
      float a = dy[k] / D[k];
      float b = dy[k1] / D[k];
      float tau = a * a + b * b;
      if (tau > 9.0) {
        dy[k] = 3.0 * a * D[k] / sqrt(tau);
        dy[k1] = 3.0 * b * D[k] / sqrt(tau);
      }
    }
  }
  float t = x - floor(x);
  if (t < px[0]) t += 1.0;
  int n0 = count - 1;
  for (int k = 0; k < ${MAX_NODES}; k++) {
    if (k >= count) break;
    if (px[k] > t) { n0 = k - 1; break; }
  }
  int n1 = n0 + 1 < count ? n0 + 1 : 0;
  float h = n1 > n0 ? px[n1] - px[n0] : px[n1] - (px[n0] - 1.0);
  float u = (t - px[n0]) / h;
  float u2 = u * u;
  float u3 = u2 * u;
  float h10 = u3 - 2.0 * u2 + u;
  float h01 = -2.0 * u3 + 3.0 * u2;
  float h11 = u3 - u2;
  return py[n0] + (py[n1] - py[n0]) * h01 + h * (dy[n0] * h10 + dy[n1] * h11);
}
// Curve ring * 3 + channel (rings shadows, midtones, highlights; channels
// saturation, brightness, hue) sampled at x; 0.5 below two nodes.
float ceSample(int curve, float x) {
  vec4 n[${CHUNKS}];
  int count = 0;
  ${curveSwitch}
  return count < 2 ? 0.5 : ceHermite(n, count, x);
}
`;

// ── The table's level and lookup (the sampler is a parameter) ────────────────

export const LUT_GLSL = `
// The largest level <= ${MAX_LUT_LEVEL} whose cube fits the target's texels, never below 2.
int ceLutLevel(int texels) {
  int l = min(${MAX_LUT_LEVEL}, int(floor(pow(float(texels), 1.0 / 3.0))) + 1);
  for (int k = 0; k < 3; k++) {
    if (l * l * l > texels) l--;
  }
  return max(2, l);
}
vec3 ceTexel(sampler2D lut, int w, int i) { return texelFetch(lut, ivec2(i - w * (i / w), i / w), 0).rgb; }
bool ceMarked(sampler2D lut, int w, int level) {
  return all(equal(ceTexel(lut, w, level * level * level), vec3(${lit(-1)}, ${lit(0.5)}, ${lit(-1)})));
}
// lut3d.c over the displacement table: n in [0, 1]^3, the eight corners read
// once, then tetrahedral (mode 0), trilinear (1) or pyramid (2).
vec3 ceInterp(sampler2D lut, int w, int level, vec3 n, int mode) {
  vec3 scaled = n * float(level - 1);
  ivec3 idx = clamp(ivec3(scaled), ivec3(0), ivec3(level - 2));
  vec3 f = scaled - vec3(idx);
  int level2 = level * level;
  int color = idx.x + idx.y * level + idx.z * level2;
  vec3 c000 = ceTexel(lut, w, color);
  vec3 c100 = ceTexel(lut, w, color + 1);
  vec3 c010 = ceTexel(lut, w, color + level);
  vec3 c110 = ceTexel(lut, w, color + level + 1);
  vec3 c001 = ceTexel(lut, w, color + level2);
  vec3 c101 = ceTexel(lut, w, color + level2 + 1);
  vec3 c011 = ceTexel(lut, w, color + level + level2);
  vec3 c111 = ceTexel(lut, w, color + level + level2 + 1);
  float r = f.x;
  float g = f.y;
  float b = f.z;
  if (mode == 1) {
    vec3 x00 = mix(c000, c100, r);
    vec3 x10 = mix(c010, c110, r);
    vec3 x01 = mix(c001, c101, r);
    vec3 x11 = mix(c011, c111, r);
    return mix(mix(x00, x10, g), mix(x01, x11, g), b);
  }
  if (mode == 2) {
    if (g > r && b > r) return c000 + (c111 - c011) * r + (c010 - c000) * g + (c001 - c000) * b + (c011 - c001 - c010 + c000) * g * b;
    if (r > g && b > g) return c000 + (c100 - c000) * r + (c111 - c101) * g + (c001 - c000) * b + (c101 - c001 - c100 + c000) * r * b;
    return c000 + (c100 - c000) * r + (c010 - c000) * g + (c111 - c110) * b + (c110 - c100 - c010 + c000) * r * g;
  }
  if (r > g) {
    if (g > b) return (1.0 - r) * c000 + (r - g) * c100 + (g - b) * c110 + b * c111;
    if (r > b) return (1.0 - r) * c000 + (r - b) * c100 + (b - g) * c101 + g * c111;
    return (1.0 - b) * c000 + (b - r) * c001 + (r - g) * c101 + g * c111;
  }
  if (b > g) return (1.0 - b) * c000 + (b - g) * c001 + (g - r) * c011 + r * c111;
  if (b > r) return (1.0 - g) * c000 + (g - b) * c010 + (b - r) * c011 + r * c111;
  return (1.0 - g) * c000 + (g - r) * c010 + (r - b) * c110 + b * c111;
}
`;

// ── Pass and inline bodies ───────────────────────────────────────────────────

/** Ring anchors, two texels each: (L, rho, theta) then (deltaL, scale,
 *  deltaTheta). Anchor a = texel / 2, ring a / 64, hue sample a mod 64. */
export const ANCHORS_GLSL = `
{
  int w = int(1.0 / uTexel.x + 0.5);
  ivec2 px = ivec2(vUv / uTexel);
  int i = px.y * w + px.x;
  if (i >= ${3 * HUE_SAMPLES * 2}) {
    c = vec3(0.0);
  } else {
    int a = i / 2;
    int ring = a / ${HUE_SAMPLES};
    int hs = a - ring * ${HUE_SAMPLES};
    float x = float(hs) / ${lit(HUE_SAMPLES)};
    float hue = ceCurveXToHue(x);
    float shift = ceChannelValue(2, ceSample(ring * 3 + 2, x));
    float sat = ceChannelValue(0, ceSample(ring * 3 + 0, x));
    float bri = ceChannelValue(1, ceSample(ring * 3 + 1, x));
    float S = ceRefSat(ring);
    float B = ceRingBrightness(ring);
    vec3 axis = vec3(ceAxisRgb(ring));
    vec3 before = ceShell(axis, ceHsbToLutRgb(vec3(hue, S, B)));
    vec3 after = ceShell(axis, ceHsbToLutRgb(vec3(ceWrapHuePi(hue + shift), clamp(S * sat, 0.0, 1.0), clamp(B * bri, 0.0, 1.0))));
    vec3 p = ceGrayCyl(before);
    vec3 q = ceGrayCyl(after);
    float projected = p.y > 1e-6 ? q.y / p.y : 1.0;
    float scale = sat <= 1.0 ? sat : min(sat, projected);
    c = (i - 2 * a) == 0 ? p : vec3(q.x - p.x, scale, ceWrapPi(shift));
  }
}
`;

/** The displacement table: lattice point i < level³ of the level that fits
 *  the target, the marker texel at level³, zero beyond. Ring anchors are read
 *  from the previous draw at their texel centres, the second texel only
 *  inside the ellipsoid; the achromatic ring is analytic. */
export const LATTICE_GLSL = `
{
  int w = int(1.0 / uTexel.x + 0.5);
  int hgt = int(1.0 / uTexel.y + 0.5);
  int level = ceLutLevel(w * hgt);
  int n3 = level * level * level;
  ivec2 px = ivec2(vUv / uTexel);
  int i = px.y * w + px.x;
  if (i == n3) {
    c = vec3(${lit(-1)}, ${lit(0.5)}, ${lit(-1)});
  } else if (i > n3) {
    c = vec3(0.0);
  } else {
    int r = i - level * (i / level);
    int g = (i / level) - level * (i / (level * level));
    int b = i / (level * level);
    vec3 x = vec3(r, g, b) / float(level - 1);
    vec3 cyl = ceGrayCyl(x);
    vec3 d = vec3(0.0);
    if (cyl.y > 1e-6) {
      float sigmaRhoSafe = max(sigmaRho, 1e-6);
      float invL = 1.0 / max(sigmaL * 0.01, 1e-6);
      float invR = 1.0 / sigmaRhoSafe;
      float invT = 1.0 / max(sigmaTheta, 1e-6);
      float rho0 = max(neutralProtection, 0.0) * sigmaRhoSafe;
      float sw = 0.0;
      float sdL = 0.0;
      float ssc = 0.0;
      float sdt = 0.0;
      for (int a = 0; a < ${3 * HUE_SAMPLES}; a++) {
        int t0 = 2 * a;
        vec3 anc = readPrev((vec2(t0 - w * (t0 / w), t0 / w) + 0.5) * uTexel);
        float dL = (cyl.x - anc.x) * invL;
        float dr = (cyl.y - anc.y) * invR;
        float dh = ceWrapPi(cyl.z - anc.z) * invT;
        float d2 = dL * dL + dr * dr + dh * dh;
        if (d2 >= 1.0) continue;
        int t1 = t0 + 1;
        vec3 del = readPrev((vec2(t1 - w * (t1 / w), t1 / w) + 0.5) * uTexel);
        float wgt = ceWendland(sqrt(d2));
        sw += wgt;
        sdL += wgt * del.x;
        ssc += wgt * del.y;
        sdt += wgt * del.z;
      }
      for (int s = 0; s < ${AXIS_SAMPLES}; s++) {
        float dL = (cyl.x - float(s) / ${lit(AXIS_SAMPLES - 1)} * ${lit(Math.sqrt(3))}) * invL;
        float dr = cyl.y * invR;
        float dh = ceWrapPi(cyl.z) * invT;
        float d2 = dL * dL + dr * dr + dh * dh;
        if (d2 >= 1.0) continue;
        float wgt = ceWendland(sqrt(d2)) / ${lit(AXIS_SAMPLES)};
        sw += wgt;
        ssc += wgt;
      }
      if (sw > ${lit(FLT_MIN)}) {
        float tdL = sdL / sw;
        float sc = ssc / sw;
        float tdt = sdt / sw;
        if (!(abs(tdL) <= 1e-6 && abs(sc - 1.0) <= 1e-6 && abs(tdt) <= 1e-6)) {
          float t = rho0 > 0.0 ? clamp(cyl.y / rho0, 0.0, 1.0) : 1.0;
          float alpha = t * t * (3.0 - 2.0 * t);
          float L = cyl.x + alpha * tdL;
          float rho = cyl.y * max(1.0 + alpha * (sc - 1.0), 0.0);
          float th = cyl.z + alpha * tdt;
          vec3 target = ceShell(vec3(L * ${lit(0.5773502691896258)}), ceGrayToRgb(L, rho * cos(th), rho * sin(th)));
          d = target - x;
        }
      }
    }
    c = clamp(x + d, 0.0, 1.0) - x;
  }
}
`;

/** The inline block for the host's result sampler `sampler`: white level,
 *  HLG Rec2020 code values, the displacement lookup with the excess beyond
 *  the cube kept, and back. */
export function inlineGlsl(sampler: string): string {
  return `
{
  if (on > 0.5) {
    ivec2 sz = textureSize(${sampler}, 0);
    int level = ceLutLevel(sz.x * sz.y);
    if (ceMarked(${sampler}, sz.x, level)) {
      const mat3 toRec2020 = ${mat3(SRGB_TO_REC2020)};
      const mat3 toSrgb = ${mat3(REC2020_TO_SRGB)};
      float white = exp2(whiteLevel);
      vec3 e = ceHlgOetf(toRec2020 * (lin / white));
      vec3 n = clamp(e, 0.0, 1.0);
      lin = white * (toSrgb * ceHlgEotf(n + ceInterp(${sampler}, sz.x, level, n, interpolation) + (e - n)));
    }
  }
}
`;
}
