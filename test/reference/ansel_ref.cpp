// Ansel's colour equalizer, the pieces the extension transcribes, run over fixed
// inputs and printed as JSON. Ansel master (September 2026), © Aurélien Pierre,
// GPL-3.0-or-later; darktable UCS 22 © Aurélien Pierre. Single precision
// throughout, as Ansel runs it. See README.md for what is verbatim and what is
// not.

#include <cfloat>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <vector>

#include "math/splines.h"

// ── shims for the darktable/Ansel vocabulary ─────────────────────────────────

typedef float dt_aligned_pixel_t[4];
typedef float dt_colormatrix_t[4][4];
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#define M_PI_F 3.14159265358979324f
#define CLAMP(v, lo, hi) ((v) < (lo) ? (lo) : ((v) > (hi) ? (hi) : (v)))
#define IS_NULL_PTR(p) ((p) == nullptr)
#define for_each_channel(c, ...) for (int c = 0; c < 4; c++)
static inline float sqf(const float x) { return x * x; }

static inline void dt_apply_transposed_color_matrix(const dt_aligned_pixel_t in, const dt_colormatrix_t M_T,
                                                    dt_aligned_pixel_t out)
{
  for (int c = 0; c < 3; c++) out[c] = in[0] * M_T[0][c] + in[1] * M_T[1][c] + in[2] * M_T[2][c];
  out[3] = 0.f;
}

// ── colorspaces_inline_conversions.h (verbatim) ──────────────────────────────

static inline void dt_XYZ_to_xyY(const dt_aligned_pixel_t XYZ, dt_aligned_pixel_t xyY)
{
  const float sum = XYZ[0] + XYZ[1] + XYZ[2];
  xyY[0] = XYZ[0] / sum;
  xyY[1] = XYZ[1] / sum;
  xyY[2] = XYZ[1];
}

static inline void dt_xyY_to_XYZ(const dt_aligned_pixel_t xyY, dt_aligned_pixel_t XYZ)
{
  XYZ[0] = xyY[2] * xyY[0] / xyY[1];
  XYZ[1] = xyY[2];
  XYZ[2] = xyY[2] * (1.f - xyY[0] - xyY[1]) / xyY[1];
}

/** Uses D50 **/
static inline void dt_XYZ_to_Rec709_D50(const dt_aligned_pixel_t XYZ, dt_aligned_pixel_t sRGB)
{
  static const dt_colormatrix_t xyz_to_srgb_matrix_transposed =
    { {  3.1338561f, -0.9787684f,  0.0719453f, 0.0f },
      { -1.6168667f,  1.9161415f, -0.2289914f, 0.0f },
      { -0.4906146f,  0.0334540f,  1.4052427f, 0.0f } };
  dt_apply_transposed_color_matrix(XYZ, xyz_to_srgb_matrix_transposed, sRGB);
}

/** uses D50 white point. */
static inline void dt_XYZ_to_sRGB(const dt_aligned_pixel_t XYZ, dt_aligned_pixel_t sRGB)
{
  dt_aligned_pixel_t rgb;
  dt_XYZ_to_Rec709_D50(XYZ, rgb);
  for(size_t c = 0; c < 3; c++)
    sRGB[c] = rgb[c] <= 0.0031308f ? 12.92f * rgb[c] : (1.0f + 0.055f) * powf(rgb[c], 1.0f / 2.4f) - 0.055f;
}

static inline void dt_Rec709_to_XYZ_D50(const dt_aligned_pixel_t sRGB, dt_aligned_pixel_t XYZ_D50)
{
  static const dt_colormatrix_t M = {
    { 0.4360747f, 0.2225045f, 0.0139322f, 0.0f },
    { 0.3850649f, 0.7168786f, 0.0971045f, 0.0f },
    { 0.1430804f, 0.0606169f, 0.7141733f, 0.0f }
  };
  dt_apply_transposed_color_matrix(sRGB, M, XYZ_D50);
}

static inline float Y_to_dt_UCS_L_star(const float Y)
{
  const float Y_hat = powf(Y, 0.631651345306265f);
  return 2.098883786377f * Y_hat / (Y_hat + 1.12426773749357f);
}

static inline float dt_UCS_L_star_to_Y(const float L_star)
{
  return powf((1.12426773749357f * L_star / (2.098883786377f - L_star)), 1.5831518565279648f);
}

static inline void xyY_to_dt_UCS_UV(const dt_aligned_pixel_t xyY, float UV_star_prime[2])
{
  const dt_aligned_pixel_t x_factors = { -0.783941002840055f,  0.745273540913283f, 0.318707282433486f, 0.f };
  const dt_aligned_pixel_t y_factors = {  0.277512987809202f, -0.205375866083878f, 2.16743692732158f,  0.f };
  const dt_aligned_pixel_t offsets   = {  0.153836578598858f, -0.165478376301988f, 0.291320554395942f, 0.f };

  dt_aligned_pixel_t UVD = { 0.f };
  for_each_channel(c, aligned(xyY, UVD, x_factors, y_factors, offsets))
    UVD[c] = x_factors[c] * xyY[0] + y_factors[c] * xyY[1] + offsets[c];

  UVD[0] /= UVD[2];
  UVD[1] /= UVD[2];

  float UV_star[2] = { 0.f };
  const float factors[2]     = { 1.39656225667f, 1.4513954287f };
  const float half_values[2] = { 1.49217352929f, 1.52488637914f };
  for(int c = 0; c < 2; c++)
    UV_star[c] = factors[c] * UVD[c] / (fabsf(UVD[c]) + half_values[c]);

  UV_star_prime[0] = -1.124983854323892f * UV_star[0] - 0.980483721769325f * UV_star[1];
  UV_star_prime[1] =  1.86323315098672f  * UV_star[0] + 1.971853092390862f * UV_star[1];
}

static inline void dt_UCS_LUV_to_JCH(const float L_star, const float L_white, const float UV_star_prime[2], dt_aligned_pixel_t JCH)
{
  const float M2 = UV_star_prime[0] * UV_star_prime[0] + UV_star_prime[1] * UV_star_prime[1];
  JCH[0] = L_star / L_white;
  JCH[1] = 15.932993652962535f * powf(L_star, 0.6523997524738018f) * powf(M2, 0.6007557017508491f) / L_white;
  JCH[2] = atan2f(UV_star_prime[1], UV_star_prime[0]);
}

static inline void xyY_to_dt_UCS_JCH(const dt_aligned_pixel_t xyY, const float L_white, dt_aligned_pixel_t JCH)
{
  float UV_star_prime[2];
  xyY_to_dt_UCS_UV(xyY, UV_star_prime);
  dt_UCS_LUV_to_JCH(Y_to_dt_UCS_L_star(xyY[2]), L_white, UV_star_prime, JCH);
}

static inline void dt_UCS_JCH_to_xyY(const dt_aligned_pixel_t JCH, const float L_white, dt_aligned_pixel_t xyY)
{
  const float L_star = JCH[0] * L_white;
  const float M = powf(JCH[1] * L_white / (15.932993652962535f * powf(L_star, 0.6523997524738018f)), 0.8322850678616855f);

  const float U_star_prime = M * cosf(JCH[2]);
  const float V_star_prime = M * sinf(JCH[2]);

  const float UV_star[2] = { -5.037522385190711f * U_star_prime - 2.504856328185843f * V_star_prime,
                              4.760029407436461f * U_star_prime + 2.874012963239247f * V_star_prime };

  float UV[2] = { 0.f };
  const float factors[2]     = { 1.39656225667f, 1.4513954287f };
  const float half_values[2] = { 1.49217352929f, 1.52488637914f };
  for(int c = 0; c < 2; c++)
    UV[c] = -half_values[c] * UV_star[c] / (fabsf(UV_star[c]) - factors[c]);

  const dt_aligned_pixel_t U_factors = {  0.167171472114775f,   -0.150959086409163f,    0.940254742367256f,  0.f };
  const dt_aligned_pixel_t V_factors = {  0.141299802443708f,   -0.155185060382272f,    1.000000000000000f,  0.f };
  const dt_aligned_pixel_t offsets   = { -0.00801531300850582f, -0.00843312433578007f, -0.0256325967652889f, 0.f };

  dt_aligned_pixel_t xyD = { 0.f };
  for_each_channel(c, aligned(xyD, UV, U_factors, V_factors, offsets))
    xyD[c] = U_factors[c] * UV[0] + V_factors[c] * UV[1] + offsets[c];

  xyY[0] = xyD[0] / xyD[2];
  xyY[1] = xyD[1] / xyD[2];
  xyY[2] = dt_UCS_L_star_to_Y(L_star);
}

static inline void dt_UCS_JCH_to_HSB(const dt_aligned_pixel_t JCH, dt_aligned_pixel_t HSB)
{
  HSB[2] = JCH[0] * (powf(JCH[1], 1.33654221029386f) + 1.f);
  HSB[1] = (HSB[2] > 0.f) ? JCH[1] / HSB[2] : 0.f;
  HSB[0] = JCH[2];
}

static inline void dt_UCS_HSB_to_JCH(const dt_aligned_pixel_t HSB, dt_aligned_pixel_t JCH)
{
  JCH[2] = HSB[0];
  JCH[1] = HSB[1] * HSB[2];
  JCH[0] = HSB[2] / (powf(JCH[1], 1.33654221029386f) + 1.f);
}

static inline void dt_UCS_HSB_to_XYZ(const dt_aligned_pixel_t HSB, const float L_w, dt_aligned_pixel_t XYZ)
{
  dt_aligned_pixel_t JCH = { 0.f };
  dt_aligned_pixel_t xyY = { 0.f };
  dt_UCS_HSB_to_JCH(HSB, JCH);
  dt_UCS_JCH_to_xyY(JCH, L_w, xyY);
  dt_xyY_to_XYZ(xyY, XYZ);
}

// ── chromatic_adaptation.h (verbatim) ────────────────────────────────────────

static const dt_colormatrix_t XYZ_D50_to_D65_CAT16_transposed
    = { { 9.89466254e-01f, -5.40518733e-03f, -4.03920992e-04f, 0.f },
        { -4.00304626e-02f, 1.00666069e+00f, 1.50768030e-02f, 0.f },
        { 4.40530317e-02f, -1.75551955e-03f, 1.30210211e+00f, 0.f } };

static const dt_colormatrix_t XYZ_D65_to_D50_CAT16_transposed
    = { { 1.01085433e+00f, 5.42814201e-03f, 2.50722468e-04f, 0.f },
        { 4.07086103e-02f, 9.93581926e-01f, -1.14918759e-02f, 0.f },
        { -3.41445825e-02f, 1.15592039e-03f, 7.67964947e-01f, 0.f } };

static inline void XYZ_D50_to_D65(const dt_aligned_pixel_t XYZ_in, dt_aligned_pixel_t XYZ_out)
{
  dt_apply_transposed_color_matrix(XYZ_in, XYZ_D50_to_D65_CAT16_transposed, XYZ_out);
}

static inline void XYZ_D65_to_D50(const dt_aligned_pixel_t XYZ_in, dt_aligned_pixel_t XYZ_out)
{
  dt_apply_transposed_color_matrix(XYZ_in, XYZ_D65_to_D50_CAT16_transposed, XYZ_out);
}

// ── the "HLG Rec2020 RGB" profile path (implemented, see README) ─────────────

static double REC2020_TO_XYZ_D50[3][3];
static double XYZ_D50_TO_REC2020[3][3];

static void mat3_inverse(const double m[3][3], double out[3][3])
{
  const double det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                     + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  out[0][0] = (m[1][1] * m[2][2] - m[1][2] * m[2][1]) / det;
  out[0][1] = (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / det;
  out[0][2] = (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det;
  out[1][0] = (m[1][2] * m[2][0] - m[1][0] * m[2][2]) / det;
  out[1][1] = (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det;
  out[1][2] = (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / det;
  out[2][0] = (m[1][0] * m[2][1] - m[1][1] * m[2][0]) / det;
  out[2][1] = (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / det;
  out[2][2] = (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / det;
}

static void mat3_mul(const double a[3][3], const double b[3][3], double out[3][3])
{
  for (int i = 0; i < 3; i++)
    for (int j = 0; j < 3; j++) out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
}

// lcms builds cmsCreateRGBProfile's colorants from the xy primaries and white
// (_cmsBuildRGB2XYZtransferMatrix) and adapts them to D50 with Bradford
// (_cmsAdaptationMatrix, cmsD50_XYZ); darktable reads the matrix back from
// the tags. Same construction, in double.
static void build_rec2020_d50()
{
  const double px[3] = { 0.7080, 0.1700, 0.1310 }, py[3] = { 0.2920, 0.7970, 0.0460 };
  const double wx = 0.312700492, wy = 0.329000939;
  double prim[3][3];
  for (int i = 0; i < 3; i++)
  {
    prim[0][i] = px[i] / py[i];
    prim[1][i] = 1.0;
    prim[2][i] = (1.0 - px[i] - py[i]) / py[i];
  }
  const double W[3] = { wx / wy, 1.0, (1.0 - wx - wy) / wy };
  double inv[3][3];
  mat3_inverse(prim, inv);
  double S[3];
  for (int i = 0; i < 3; i++) S[i] = inv[i][0] * W[0] + inv[i][1] * W[1] + inv[i][2] * W[2];
  double rgb2xyz[3][3];
  for (int i = 0; i < 3; i++)
    for (int j = 0; j < 3; j++) rgb2xyz[i][j] = prim[i][j] * S[j];

  const double B[3][3] = { { 0.8951, 0.2664, -0.1614 }, { -0.7502, 1.7135, 0.0367 }, { 0.0389, -0.0685, 1.0296 } };
  const double D50[3] = { 0.9642, 1.0, 0.8249 };
  double src[3], dst[3];
  for (int i = 0; i < 3; i++)
  {
    src[i] = B[i][0] * W[0] + B[i][1] * W[1] + B[i][2] * W[2];
    dst[i] = B[i][0] * D50[0] + B[i][1] * D50[1] + B[i][2] * D50[2];
  }
  double Binv[3][3], diagB[3][3], adapt[3][3];
  mat3_inverse(B, Binv);
  for (int i = 0; i < 3; i++)
    for (int j = 0; j < 3; j++) diagB[i][j] = (dst[i] / src[i]) * B[i][j];
  mat3_mul(Binv, diagB, adapt);
  mat3_mul(adapt, rgb2xyz, REC2020_TO_XYZ_D50);
  mat3_inverse(REC2020_TO_XYZ_D50, XYZ_D50_TO_REC2020);
}

// BT.2100 HLG, both directions analytic. Ansel's table clips below 0; so do we.
static const double HLG_A = 0.17883277, HLG_B = 0.28466892, HLG_C = 0.55991073;
static float hlg_oetf(const float E)
{
  if (E <= 0.f) return 0.f;
  if (E <= 1.f / 12.f) return sqrtf(3.f * E);
  return (float)(HLG_A * log(12.0 * (double)E - HLG_B) + HLG_C);
}
static float hlg_eotf(const float e)
{
  if (e <= 0.f) return 0.f;
  if (e <= 0.5f) return e * e / 3.f;
  return (float)((exp(((double)e - HLG_C) / HLG_A) + HLG_B) / 12.0);
}

static void xyz_d50_to_lut_rgb(const dt_aligned_pixel_t XYZ, dt_aligned_pixel_t RGB)
{
  for (int c = 0; c < 3; c++)
  {
    const double lin = XYZ_D50_TO_REC2020[c][0] * XYZ[0] + XYZ_D50_TO_REC2020[c][1] * XYZ[1] + XYZ_D50_TO_REC2020[c][2] * XYZ[2];
    RGB[c] = hlg_oetf((float)lin);
  }
  RGB[3] = 0.f;
}

static void lut_rgb_to_xyz_d50(const dt_aligned_pixel_t RGB, dt_aligned_pixel_t XYZ)
{
  double lin[3];
  for (int c = 0; c < 3; c++) lin[c] = hlg_eotf(RGB[c]);
  for (int c = 0; c < 3; c++)
    XYZ[c] = (float)(REC2020_TO_XYZ_D50[c][0] * lin[0] + REC2020_TO_XYZ_D50[c][1] * lin[1] + REC2020_TO_XYZ_D50[c][2] * lin[2]);
  XYZ[3] = 0.f;
}

// ── colorequal_shared.c (verbatim, the profile calls routed above) ───────────

float dt_colorrings_graph_white(void)
{
  return Y_to_dt_UCS_L_star(1.f);
}

float dt_colorrings_wrap_hue_2pi(float hue)
{
  while(hue < 0.f) hue += 2.f * M_PI_F;
  while(hue >= 2.f * M_PI_F) hue -= 2.f * M_PI_F;
  return hue;
}

float dt_colorrings_wrap_hue_pi(float hue)
{
  hue = dt_colorrings_wrap_hue_2pi(hue + M_PI_F);
  return hue - M_PI_F;
}

#define DT_COLORRINGS_ANGLE_SHIFT +20.f
#define DT_COLORRINGS_NUM_RINGS 3
#define DT_COLORRINGS_MAXNODES 20
#define DT_COLORRINGS_HUE_SAMPLES 64
#define DT_COLORRINGS_LOCAL_FIELD_RINGS (DT_COLORRINGS_NUM_RINGS + 1)

typedef struct dt_colorrings_node_t
{
  float x;
  float y;
} dt_colorrings_node_t;

float dt_colorrings_curve_x_to_hue(const float x)
{
  return dt_colorrings_wrap_hue_pi((360.f * x + DT_COLORRINGS_ANGLE_SHIFT) * M_PI_F / 180.f);
}

float dt_colorrings_hue_to_curve_x(const float hue)
{
  return dt_colorrings_wrap_hue_2pi(hue - DT_COLORRINGS_ANGLE_SHIFT * M_PI_F / 180.f) / (2.f * M_PI_F);
}

float dt_colorrings_ring_brightness(const int ring)
{
  switch(ring)
  {
    case 0: return 0.15f;
    case 2: return 0.75f;
    case 1:
    default: return 0.45f;
  }
}

float dt_colorrings_curve_periodic_sample(const dt_colorrings_node_t *curve, const int nodes, const float x)
{
  if(IS_NULL_PTR(curve) || nodes < 2) return 0.5f;
  CurveAnchorPoint anchors[DT_COLORRINGS_MAXNODES];
  for(int k = 0; k < nodes; k++)
  {
    anchors[k].x = curve[k].x;
    anchors[k].y = curve[k].y;
  }
  return interpolate_val_V2_periodic(nodes, anchors, x, MONOTONE_HERMITE, 1.f);
}

static inline void _dt_ucs_hsb_to_preview_rgb_unclamped(const dt_aligned_pixel_t HSB, const float white,
                                                        dt_aligned_pixel_t RGB)
{
  dt_aligned_pixel_t XYZ_D65 = { 0.f };
  dt_aligned_pixel_t XYZ_D50 = { 0.f };
  dt_UCS_HSB_to_XYZ(HSB, white, XYZ_D65);
  XYZ_D65_to_D50(XYZ_D65, XYZ_D50);
  dt_XYZ_to_sRGB(XYZ_D50, RGB);
}

void dt_colorrings_hsb_to_profile_rgb(const dt_aligned_pixel_t HSB, const float white, dt_aligned_pixel_t RGB)
{
  dt_aligned_pixel_t XYZ_D65 = { 0.f };
  dt_aligned_pixel_t XYZ_D50 = { 0.f };
  dt_UCS_HSB_to_XYZ(HSB, white, XYZ_D65);
  XYZ_D65_to_D50(XYZ_D65, XYZ_D50);
  xyz_d50_to_lut_rgb(XYZ_D50, RGB);
}

// dt_colorrings_hsb_to_display_rgb with an sRGB display profile.
void dt_colorrings_hsb_to_display_rgb(const dt_aligned_pixel_t HSB, const float white, dt_aligned_pixel_t RGB)
{
  dt_aligned_pixel_t XYZ_D65 = { 0.f };
  dt_aligned_pixel_t XYZ_D50 = { 0.f };
  dt_aligned_pixel_t linear_rgb = { 0.f };
  dt_UCS_HSB_to_XYZ(HSB, white, XYZ_D65);
  XYZ_D65_to_D50(XYZ_D65, XYZ_D50);
  dt_XYZ_to_Rec709_D50(XYZ_D50, linear_rgb);
  const float max_rgb = fmaxf(linear_rgb[0], fmaxf(linear_rgb[1], linear_rgb[2]));
  if(linear_rgb[0] > 1.f || linear_rgb[1] > 1.f || linear_rgb[2] > 1.f)
    for_each_channel(c, aligned(linear_rgb)) linear_rgb[c] /= max_rgb;
  for_each_channel(c, aligned(RGB, linear_rgb))
    RGB[c] = linear_rgb[c] <= 0.0031308f ? 12.92f * linear_rgb[c]
                                         : (1.0f + 0.055f) * powf(linear_rgb[c], 1.0f / 2.4f) - 0.055f;
  for_each_channel(c, aligned(RGB)) RGB[c] = CLAMP(RGB[c], 0.f, 1.f);
}

static float _compute_reference_saturation(const float white, const float brightness)
{
  float low = 0.f;
  float high = 1.f;
  for(int iter = 0; iter < 18; iter++)
  {
    const float candidate = 0.5f * (low + high);
    bool valid = true;
    for(int hue = 0; hue < DT_COLORRINGS_HUE_SAMPLES; hue++)
    {
      dt_aligned_pixel_t RGB = { 0.f };
      const dt_aligned_pixel_t HSB = { dt_colorrings_curve_x_to_hue((float)hue / (float)DT_COLORRINGS_HUE_SAMPLES),
                                       candidate, brightness, 0.f };
      _dt_ucs_hsb_to_preview_rgb_unclamped(HSB, white, RGB);
      if(RGB[0] < 0.f || RGB[0] > 1.f || RGB[1] < 0.f || RGB[1] > 1.f || RGB[2] < 0.f || RGB[2] > 1.f)
      {
        valid = false;
        break;
      }
    }
    if(valid)
      low = candidate;
    else
      high = candidate;
  }
  return low;
}

void dt_colorrings_compute_reference_saturations(const float white, float reference_saturation[DT_COLORRINGS_NUM_RINGS])
{
  for(int ring = 0; ring < DT_COLORRINGS_NUM_RINGS; ring++)
    if(reference_saturation[ring] == 0.f)
      reference_saturation[ring] = _compute_reference_saturation(white, dt_colorrings_ring_brightness(ring));
}

float dt_colorrings_ring_axis_position_from_brightness(const float brightness, const float white)
{
  const dt_aligned_pixel_t HSB = { 0.f, 0.f, CLAMP(brightness, 0.f, 1.f), 0.f };
  dt_aligned_pixel_t RGB = { 0.f };
  dt_colorrings_hsb_to_profile_rgb(HSB, white, RGB);
  return CLAMP((RGB[0] + RGB[1] + RGB[2]) / 3.f, 0.f, 1.f);
}

void dt_colorrings_brightness_to_axis_rgb(const float brightness, const float white, dt_aligned_pixel_t RGB)
{
  const float axis = dt_colorrings_ring_axis_position_from_brightness(brightness, white);
  RGB[0] = axis;
  RGB[1] = axis;
  RGB[2] = axis;
  RGB[3] = 0.f;
}

float dt_colorrings_vector_norm3(const dt_aligned_pixel_t vector)
{
  return sqrtf(sqf(vector[0]) + sqf(vector[1]) + sqf(vector[2]));
}

float dt_colorrings_distance_to_cube_shell(const dt_aligned_pixel_t axis, const dt_aligned_pixel_t direction)
{
  float distance = INFINITY;
  for(int c = 0; c < 3; c++)
  {
    if(fabsf(direction[c]) < 1e-6f) continue;
    const float bound = (direction[c] > 0.f) ? 1.f : 0.f;
    const float candidate = (bound - axis[c]) / direction[c];
    if(candidate > 0.f && candidate < distance) distance = candidate;
  }
  return std::isfinite(distance) ? distance : 0.f;
}

void dt_colorrings_project_to_cube_shell(const dt_aligned_pixel_t axis, dt_aligned_pixel_t RGB)
{
  dt_aligned_pixel_t vector = { RGB[0] - axis[0], RGB[1] - axis[1], RGB[2] - axis[2], 0.f };
  if(dt_colorrings_vector_norm3(vector) < 1e-6f) return;
  const float shell_scale = dt_colorrings_distance_to_cube_shell(axis, vector);
  if(shell_scale < 1.f)
  {
    RGB[0] = axis[0] + shell_scale * vector[0];
    RGB[1] = axis[1] + shell_scale * vector[1];
    RGB[2] = axis[2] + shell_scale * vector[2];
  }
  RGB[0] = CLAMP(RGB[0], 0.f, 1.f);
  RGB[1] = CLAMP(RGB[1], 0.f, 1.f);
  RGB[2] = CLAMP(RGB[2], 0.f, 1.f);
}

void dt_colorrings_rgb_to_gray_cyl(const float rgb[3], float *L, float *rho, float *theta)
{
  const float eL0 = 0.5773502691896258f;
  const float eL1 = 0.5773502691896258f;
  const float eL2 = 0.5773502691896258f;
  const float eu0 = 0.7071067811865475f;
  const float eu1 = -0.7071067811865475f;
  const float eu2 = 0.0f;
  const float ev0 = 0.4082482904638630f;
  const float ev1 = 0.4082482904638630f;
  const float ev2 = -0.8164965809277260f;
  *L = rgb[0] * eL0 + rgb[1] * eL1 + rgb[2] * eL2;
  const float u = rgb[0] * eu0 + rgb[1] * eu1 + rgb[2] * eu2;
  const float v = rgb[0] * ev0 + rgb[1] * ev1 + rgb[2] * ev2;
  *rho = sqrtf(u * u + v * v);
  *theta = atan2f(v, u);
}

void dt_colorrings_gray_basis_to_rgb(const float L, const float u, const float v, float rgb[3])
{
  const float eL0 = 0.5773502691896258f;
  const float eL1 = 0.5773502691896258f;
  const float eL2 = 0.5773502691896258f;
  const float eu0 = 0.7071067811865475f;
  const float eu1 = -0.7071067811865475f;
  const float eu2 = 0.0f;
  const float ev0 = 0.4082482904638630f;
  const float ev1 = 0.4082482904638630f;
  const float ev2 = -0.8164965809277260f;
  rgb[0] = L * eL0 + u * eu0 + v * ev0;
  rgb[1] = L * eL1 + u * eu1 + v * ev1;
  rgb[2] = L * eL2 + u * eu2 + v * ev2;
}

void dt_colorrings_gray_axis_rgb_from_L(const float L, dt_aligned_pixel_t RGB)
{
  const float value = L * 0.5773502691896258f;
  RGB[0] = value;
  RGB[1] = value;
  RGB[2] = value;
  RGB[3] = 0.f;
}

float dt_colorrings_wendland_c2(float d)
{
  if(d >= 1.0f) return 0.0f;
  const float t = 1.0f - d;
  return t * t * t * t * (4.0f * d + 1.0f);
}

float dt_colorrings_wrap_pi(float x)
{
  const float two_pi = 2.0f * (float)M_PI;
  while(x <= -(float)M_PI) x += two_pi;
  while(x > (float)M_PI) x -= two_pi;
  return x;
}

void dt_colorrings_eval_local_field(
    const float x[3], const float anchor_L[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float anchor_rho[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float anchor_theta[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float delta_L[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float chroma_scale[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float delta_theta[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES], const float inv_sigma_L,
    const float inv_sigma_rho, const float inv_sigma_theta, const float rho0, float out[3])
{
  float Lx, rhox, thetax;
  dt_colorrings_rgb_to_gray_cyl(x, &Lx, &rhox, &thetax);

  if(rhox <= 1e-6f)
  {
    out[0] = 0.f;
    out[1] = 0.f;
    out[2] = 0.f;
    return;
  }

  float sum_w = 0.f;
  float sum_dL = 0.f;
  float sum_scale = 0.f;
  float sum_dtheta = 0.f;

  const int n = DT_COLORRINGS_LOCAL_FIELD_RINGS * DT_COLORRINGS_HUE_SAMPLES;
  const int axis_ring = DT_COLORRINGS_LOCAL_FIELD_RINGS - 1;
  const float axis_weight_scale = 1.0f / (float)DT_COLORRINGS_HUE_SAMPLES;

  for(int k = 0; k < n; k++)
  {
    const int ring = k / DT_COLORRINGS_HUE_SAMPLES;
    const int h = k - ring * DT_COLORRINGS_HUE_SAMPLES;
    const float dL = (Lx - anchor_L[ring][h]) * inv_sigma_L;
    const float dr = (rhox - anchor_rho[ring][h]) * inv_sigma_rho;
    const float dh = dt_colorrings_wrap_pi(thetax - anchor_theta[ring][h]) * inv_sigma_theta;
    const float d2 = dL * dL + dr * dr + dh * dh;

    if(d2 >= 1.f) continue;

    float w = dt_colorrings_wendland_c2(sqrtf(d2));
    if(ring == axis_ring) w *= axis_weight_scale;

    sum_w += w;
    sum_dL += w * delta_L[ring][h];
    sum_scale += w * chroma_scale[ring][h];
    sum_dtheta += w * delta_theta[ring][h];
  }

  if(sum_w <= FLT_MIN)
  {
    out[0] = 0.f;
    out[1] = 0.f;
    out[2] = 0.f;
    return;
  }

  const float inv_w = 1.0f / sum_w;
  const float target_delta_L = sum_dL * inv_w;
  const float scale = sum_scale * inv_w;
  const float target_delta_theta = sum_dtheta * inv_w;
  if(fabsf(target_delta_L) <= 1e-6f && fabsf(scale - 1.f) <= 1e-6f && fabsf(target_delta_theta) <= 1e-6f)
  {
    out[0] = 0.f;
    out[1] = 0.f;
    out[2] = 0.f;
    return;
  }
  const float t = CLAMP(rhox / rho0, 0.f, 1.f);
  const float alpha = t * t * (3.0f - 2.0f * t);
  const float target_L = Lx + alpha * target_delta_L;
  const float target_rho = rhox * fmaxf(1.f + alpha * (scale - 1.f), 0.f);
  const float target_theta = thetax + alpha * target_delta_theta;
  dt_aligned_pixel_t target_rgb = { 0.f };
  dt_aligned_pixel_t axis = { 0.f };
  dt_colorrings_gray_basis_to_rgb(target_L, target_rho * cosf(target_theta), target_rho * sinf(target_theta),
                                  target_rgb);
  dt_colorrings_gray_axis_rgb_from_L(target_L, axis);
  dt_colorrings_project_to_cube_shell(axis, target_rgb);

  out[0] = target_rgb[0] - x[0];
  out[1] = target_rgb[1] - x[1];
  out[2] = target_rgb[2] - x[2];
}

void dt_colorrings_fill_lut_local_field(
    float *lut, const int level, const float anchor_L[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float anchor_rho[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float anchor_theta[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float delta_L[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float chroma_scale[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES],
    const float delta_theta[DT_COLORRINGS_LOCAL_FIELD_RINGS][DT_COLORRINGS_HUE_SAMPLES], const float inv_sigma_L,
    const float inv_sigma_rho, const float inv_sigma_theta, const float rho0)
{
  for(int b = 0; b < level; b++)
    for(int g = 0; g < level; g++)
      for(int r = 0; r < level; r++)
      {
        const float x[3]
            = { (float)r / (float)(level - 1), (float)g / (float)(level - 1), (float)b / (float)(level - 1) };
        float d[3];
        dt_colorrings_eval_local_field(x, anchor_L, anchor_rho, anchor_theta, delta_L, chroma_scale, delta_theta,
                                       inv_sigma_L, inv_sigma_rho, inv_sigma_theta, rho0, d);

        const size_t idx = (((size_t)b * level + (size_t)g) * level + (size_t)r) * 3u;
        lut[idx + 0] = CLAMP(x[0] + d[0], 0.f, 1.f);
        lut[idx + 1] = CLAMP(x[1] + d[1], 0.f, 1.f);
        lut[idx + 2] = CLAMP(x[2] + d[2], 0.f, 1.f);
      }
}

// ── lut3d.c (verbatim) ───────────────────────────────────────────────────────

typedef enum dt_lut3d_interpolation_t
{
  DT_LUT3D_INTERP_TETRAHEDRAL = 0,
  DT_LUT3D_INTERP_TRILINEAR = 1,
  DT_LUT3D_INTERP_PYRAMID = 2,
} dt_lut3d_interpolation_t;

static inline void _prepare_lut_input(const float *const input, float normalized[3], float residual[3],
                                      float rgbd[3], int rgbi[3], const uint16_t level,
                                      const float safe_normalization)
{
  for(int c = 0; c < 3; c++)
  {
    const float unclamped = input[c] / safe_normalization;
    normalized[c] = fminf(fmaxf(unclamped, 0.f), 1.f);
    residual[c] = unclamped - normalized[c];
  }
  for(int c = 0; c < 3; c++)
    rgbd[c] = normalized[c] * (float)(level - 1);
  for(int c = 0; c < 3; c++)
    rgbi[c] = ((int)rgbd[c] < 0) ? 0 : (((int)rgbd[c] > level - 2) ? level - 2 : (int)rgbd[c]);
  for(int c = 0; c < 3; c++)
    rgbd[c] -= rgbi[c];
}

static inline void _finish_lut_output(const float *const input, float *const output, const float residual[3],
                                      const float safe_normalization)
{
  output[0] = (output[0] + residual[0]) * safe_normalization;
  output[1] = (output[1] + residual[1]) * safe_normalization;
  output[2] = (output[2] + residual[2]) * safe_normalization;
  output[3] = input[3];
}

void dt_lut3d_tetrahedral_interp(const float *const in, float *const out, const size_t pixel_nb,
                                 const float *const clut, const uint16_t level, const float normalization)
{
  const int level2 = level * level;
  const float safe_normalization = fmaxf(normalization, 1e-6f);
  for(size_t k = 0; k < (size_t)(pixel_nb * 4); k += 4)
  {
    const float *const input = in + k;
    float *const output = out + k;
    float normalized[3];
    float residual[3];
    float rgbd[3];
    int rgbi[3];

    _prepare_lut_input(input, normalized, residual, rgbd, rgbi, level, safe_normalization);

    const int color = rgbi[0] + rgbi[1] * level + rgbi[2] * level2;
    const int i000 = color * 3;
    const int i100 = i000 + 3;
    const int i010 = (color + level) * 3;
    const int i110 = i010 + 3;
    const int i001 = (color + level2) * 3;
    const int i101 = i001 + 3;
    const int i011 = (color + level + level2) * 3;
    const int i111 = i011 + 3;

    if(rgbd[0] > rgbd[1])
    {
      if(rgbd[1] > rgbd[2])
      {
        output[0] = (1 - rgbd[0]) * clut[i000] + (rgbd[0] - rgbd[1]) * clut[i100]
                    + (rgbd[1] - rgbd[2]) * clut[i110] + rgbd[2] * clut[i111];
        output[1] = (1 - rgbd[0]) * clut[i000 + 1] + (rgbd[0] - rgbd[1]) * clut[i100 + 1]
                    + (rgbd[1] - rgbd[2]) * clut[i110 + 1] + rgbd[2] * clut[i111 + 1];
        output[2] = (1 - rgbd[0]) * clut[i000 + 2] + (rgbd[0] - rgbd[1]) * clut[i100 + 2]
                    + (rgbd[1] - rgbd[2]) * clut[i110 + 2] + rgbd[2] * clut[i111 + 2];
      }
      else if(rgbd[0] > rgbd[2])
      {
        output[0] = (1 - rgbd[0]) * clut[i000] + (rgbd[0] - rgbd[2]) * clut[i100]
                    + (rgbd[2] - rgbd[1]) * clut[i101] + rgbd[1] * clut[i111];
        output[1] = (1 - rgbd[0]) * clut[i000 + 1] + (rgbd[0] - rgbd[2]) * clut[i100 + 1]
                    + (rgbd[2] - rgbd[1]) * clut[i101 + 1] + rgbd[1] * clut[i111 + 1];
        output[2] = (1 - rgbd[0]) * clut[i000 + 2] + (rgbd[0] - rgbd[2]) * clut[i100 + 2]
                    + (rgbd[2] - rgbd[1]) * clut[i101 + 2] + rgbd[1] * clut[i111 + 2];
      }
      else
      {
        output[0] = (1 - rgbd[2]) * clut[i000] + (rgbd[2] - rgbd[0]) * clut[i001]
                    + (rgbd[0] - rgbd[1]) * clut[i101] + rgbd[1] * clut[i111];
        output[1] = (1 - rgbd[2]) * clut[i000 + 1] + (rgbd[2] - rgbd[0]) * clut[i001 + 1]
                    + (rgbd[0] - rgbd[1]) * clut[i101 + 1] + rgbd[1] * clut[i111 + 1];
        output[2] = (1 - rgbd[2]) * clut[i000 + 2] + (rgbd[2] - rgbd[0]) * clut[i001 + 2]
                    + (rgbd[0] - rgbd[1]) * clut[i101 + 2] + rgbd[1] * clut[i111 + 2];
      }
    }
    else
    {
      if(rgbd[2] > rgbd[1])
      {
        output[0] = (1 - rgbd[2]) * clut[i000] + (rgbd[2] - rgbd[1]) * clut[i001]
                    + (rgbd[1] - rgbd[0]) * clut[i011] + rgbd[0] * clut[i111];
        output[1] = (1 - rgbd[2]) * clut[i000 + 1] + (rgbd[2] - rgbd[1]) * clut[i001 + 1]
                    + (rgbd[1] - rgbd[0]) * clut[i011 + 1] + rgbd[0] * clut[i111 + 1];
        output[2] = (1 - rgbd[2]) * clut[i000 + 2] + (rgbd[2] - rgbd[1]) * clut[i001 + 2]
                    + (rgbd[1] - rgbd[0]) * clut[i011 + 2] + rgbd[0] * clut[i111 + 2];
      }
      else if(rgbd[2] > rgbd[0])
      {
        output[0] = (1 - rgbd[1]) * clut[i000] + (rgbd[1] - rgbd[2]) * clut[i010]
                    + (rgbd[2] - rgbd[0]) * clut[i011] + rgbd[0] * clut[i111];
        output[1] = (1 - rgbd[1]) * clut[i000 + 1] + (rgbd[1] - rgbd[2]) * clut[i010 + 1]
                    + (rgbd[2] - rgbd[0]) * clut[i011 + 1] + rgbd[0] * clut[i111 + 1];
        output[2] = (1 - rgbd[1]) * clut[i000 + 2] + (rgbd[1] - rgbd[2]) * clut[i010 + 2]
                    + (rgbd[2] - rgbd[0]) * clut[i011 + 2] + rgbd[0] * clut[i111 + 2];
      }
      else
      {
        output[0] = (1 - rgbd[1]) * clut[i000] + (rgbd[1] - rgbd[0]) * clut[i010]
                    + (rgbd[0] - rgbd[2]) * clut[i110] + rgbd[2] * clut[i111];
        output[1] = (1 - rgbd[1]) * clut[i000 + 1] + (rgbd[1] - rgbd[0]) * clut[i010 + 1]
                    + (rgbd[0] - rgbd[2]) * clut[i110 + 1] + rgbd[2] * clut[i111 + 1];
        output[2] = (1 - rgbd[1]) * clut[i000 + 2] + (rgbd[1] - rgbd[0]) * clut[i010 + 2]
                    + (rgbd[0] - rgbd[2]) * clut[i110 + 2] + rgbd[2] * clut[i111 + 2];
      }
    }

    _finish_lut_output(input, output, residual, safe_normalization);
  }
}

void dt_lut3d_trilinear_interp(const float *const in, float *const out, const size_t pixel_nb,
                               const float *const clut, const uint16_t level, const float normalization)
{
  const int level2 = level * level;
  const float safe_normalization = fmaxf(normalization, 1e-6f);
  for(size_t k = 0; k < (size_t)(pixel_nb * 4); k += 4)
  {
    const float *const input = in + k;
    float *const output = out + k;
    float normalized[3];
    float residual[3];
    float rgbd[3];
    int rgbi[3];
    float tmp[6];

    _prepare_lut_input(input, normalized, residual, rgbd, rgbi, level, safe_normalization);

    const int color = rgbi[0] + rgbi[1] * level + rgbi[2] * level2;
    int i = color * 3;
    int j = (color + 1) * 3;

    tmp[0] = clut[i] * (1 - rgbd[0]) + clut[j] * rgbd[0];
    tmp[1] = clut[i + 1] * (1 - rgbd[0]) + clut[j + 1] * rgbd[0];
    tmp[2] = clut[i + 2] * (1 - rgbd[0]) + clut[j + 2] * rgbd[0];

    i = (color + level) * 3;
    j = (color + level + 1) * 3;

    tmp[3] = clut[i] * (1 - rgbd[0]) + clut[j] * rgbd[0];
    tmp[4] = clut[i + 1] * (1 - rgbd[0]) + clut[j + 1] * rgbd[0];
    tmp[5] = clut[i + 2] * (1 - rgbd[0]) + clut[j + 2] * rgbd[0];

    output[0] = tmp[0] * (1 - rgbd[1]) + tmp[3] * rgbd[1];
    output[1] = tmp[1] * (1 - rgbd[1]) + tmp[4] * rgbd[1];
    output[2] = tmp[2] * (1 - rgbd[1]) + tmp[5] * rgbd[1];

    i = (color + level2) * 3;
    j = (color + level2 + 1) * 3;

    tmp[0] = clut[i] * (1 - rgbd[0]) + clut[j] * rgbd[0];
    tmp[1] = clut[i + 1] * (1 - rgbd[0]) + clut[j + 1] * rgbd[0];
    tmp[2] = clut[i + 2] * (1 - rgbd[0]) + clut[j + 2] * rgbd[0];

    i = (color + level + level2) * 3;
    j = (color + level + level2 + 1) * 3;

    tmp[3] = clut[i] * (1 - rgbd[0]) + clut[j] * rgbd[0];
    tmp[4] = clut[i + 1] * (1 - rgbd[0]) + clut[j + 1] * rgbd[0];
    tmp[5] = clut[i + 2] * (1 - rgbd[0]) + clut[j + 2] * rgbd[0];

    tmp[0] = tmp[0] * (1 - rgbd[1]) + tmp[3] * rgbd[1];
    tmp[1] = tmp[1] * (1 - rgbd[1]) + tmp[4] * rgbd[1];
    tmp[2] = tmp[2] * (1 - rgbd[1]) + tmp[5] * rgbd[1];

    output[0] = output[0] * (1 - rgbd[2]) + tmp[0] * rgbd[2];
    output[1] = output[1] * (1 - rgbd[2]) + tmp[1] * rgbd[2];
    output[2] = output[2] * (1 - rgbd[2]) + tmp[2] * rgbd[2];

    _finish_lut_output(input, output, residual, safe_normalization);
  }
}

void dt_lut3d_pyramid_interp(const float *const in, float *const out, const size_t pixel_nb,
                             const float *const clut, const uint16_t level, const float normalization)
{
  const int level2 = level * level;
  const float safe_normalization = fmaxf(normalization, 1e-6f);
  for(size_t k = 0; k < (size_t)(pixel_nb * 4); k += 4)
  {
    const float *const input = in + k;
    float *const output = out + k;
    float normalized[3];
    float residual[3];
    float rgbd[3];
    int rgbi[3];

    _prepare_lut_input(input, normalized, residual, rgbd, rgbi, level, safe_normalization);

    const int color = rgbi[0] + rgbi[1] * level + rgbi[2] * level2;
    const int i000 = color * 3;
    const int i100 = i000 + 3;
    const int i010 = (color + level) * 3;
    const int i110 = i010 + 3;
    const int i001 = (color + level2) * 3;
    const int i101 = i001 + 3;
    const int i011 = (color + level + level2) * 3;
    const int i111 = i011 + 3;

    if(rgbd[1] > rgbd[0] && rgbd[2] > rgbd[0])
    {
      output[0] = clut[i000] + (clut[i111] - clut[i011]) * rgbd[0] + (clut[i010] - clut[i000]) * rgbd[1]
                  + (clut[i001] - clut[i000]) * rgbd[2]
                  + (clut[i011] - clut[i001] - clut[i010] + clut[i000]) * rgbd[1] * rgbd[2];
      output[1] = clut[i000 + 1] + (clut[i111 + 1] - clut[i011 + 1]) * rgbd[0]
                  + (clut[i010 + 1] - clut[i000 + 1]) * rgbd[1]
                  + (clut[i001 + 1] - clut[i000 + 1]) * rgbd[2]
                  + (clut[i011 + 1] - clut[i001 + 1] - clut[i010 + 1] + clut[i000 + 1]) * rgbd[1] * rgbd[2];
      output[2] = clut[i000 + 2] + (clut[i111 + 2] - clut[i011 + 2]) * rgbd[0]
                  + (clut[i010 + 2] - clut[i000 + 2]) * rgbd[1]
                  + (clut[i001 + 2] - clut[i000 + 2]) * rgbd[2]
                  + (clut[i011 + 2] - clut[i001 + 2] - clut[i010 + 2] + clut[i000 + 2]) * rgbd[1] * rgbd[2];
    }
    else if(rgbd[0] > rgbd[1] && rgbd[2] > rgbd[1])
    {
      output[0] = clut[i000] + (clut[i100] - clut[i000]) * rgbd[0] + (clut[i111] - clut[i101]) * rgbd[1]
                  + (clut[i001] - clut[i000]) * rgbd[2]
                  + (clut[i101] - clut[i001] - clut[i100] + clut[i000]) * rgbd[0] * rgbd[2];
      output[1] = clut[i000 + 1] + (clut[i100 + 1] - clut[i000 + 1]) * rgbd[0]
                  + (clut[i111 + 1] - clut[i101 + 1]) * rgbd[1]
                  + (clut[i001 + 1] - clut[i000 + 1]) * rgbd[2]
                  + (clut[i101 + 1] - clut[i001 + 1] - clut[i100 + 1] + clut[i000 + 1]) * rgbd[0] * rgbd[2];
      output[2] = clut[i000 + 2] + (clut[i100 + 2] - clut[i000 + 2]) * rgbd[0]
                  + (clut[i111 + 2] - clut[i101 + 2]) * rgbd[1]
                  + (clut[i001 + 2] - clut[i000 + 2]) * rgbd[2]
                  + (clut[i101 + 2] - clut[i001 + 2] - clut[i100 + 2] + clut[i000 + 2]) * rgbd[0] * rgbd[2];
    }
    else
    {
      output[0] = clut[i000] + (clut[i100] - clut[i000]) * rgbd[0] + (clut[i010] - clut[i000]) * rgbd[1]
                  + (clut[i111] - clut[i110]) * rgbd[2]
                  + (clut[i110] - clut[i100] - clut[i010] + clut[i000]) * rgbd[0] * rgbd[1];
      output[1] = clut[i000 + 1] + (clut[i100 + 1] - clut[i000 + 1]) * rgbd[0]
                  + (clut[i010 + 1] - clut[i000 + 1]) * rgbd[1]
                  + (clut[i111 + 1] - clut[i110 + 1]) * rgbd[2]
                  + (clut[i110 + 1] - clut[i100 + 1] - clut[i010 + 1] + clut[i000 + 1]) * rgbd[0] * rgbd[1];
      output[2] = clut[i000 + 2] + (clut[i100 + 2] - clut[i000 + 2]) * rgbd[0]
                  + (clut[i010 + 2] - clut[i000 + 2]) * rgbd[1]
                  + (clut[i111 + 2] - clut[i110 + 2]) * rgbd[2]
                  + (clut[i110 + 2] - clut[i100 + 2] - clut[i010 + 2] + clut[i000 + 2]) * rgbd[0] * rgbd[1];
    }

    _finish_lut_output(input, output, residual, safe_normalization);
  }
}

void dt_lut3d_apply(const float *const in, float *const out, const size_t pixel_nb, const float *const clut,
                    const uint16_t level, const float normalization, const dt_lut3d_interpolation_t interpolation)
{
  switch(interpolation)
  {
    case DT_LUT3D_INTERP_TRILINEAR:
      dt_lut3d_trilinear_interp(in, out, pixel_nb, clut, level, normalization);
      return;
    case DT_LUT3D_INTERP_PYRAMID:
      dt_lut3d_pyramid_interp(in, out, pixel_nb, clut, level, normalization);
      return;
    case DT_LUT3D_INTERP_TETRAHEDRAL:
    default:
      dt_lut3d_tetrahedral_interp(in, out, pixel_nb, clut, level, normalization);
      return;
  }
}

// ── iop/colorequal.c: params, the anchor loop of _build_clut, process() ──────

// The three channels in the GUI's tab order: saturation, brightness, hue.
enum { CH_SATURATION = 0, CH_BRIGHTNESS = 1, CH_HUE = 2 };

static inline float _channel_value_from_y(const int channel, const float y)
{
  switch(channel)
  {
    case CH_HUE:
      return (y - 0.5f) * 2.f * M_PI_F;
    case CH_SATURATION:
    case CH_BRIGHTNESS:
    default:
      return CLAMP(y * 2.f, 0.f, 2.f);
  }
}

struct RefParams
{
  std::vector<dt_colorrings_node_t> curves[3][3];  // [ring][channel]
  float white_level;                               // EV
  float sigma_L, sigma_rho, sigma_theta, neutral_protection;
  int interpolation;
};

static std::vector<dt_colorrings_node_t> flat_curve()
{
  std::vector<dt_colorrings_node_t> c;
  for(int k = 0; k < 8; k++) c.push_back({ (float)k / 8.f, 0.5f });
  return c;
}

static RefParams default_params()
{
  RefParams p;
  for(int r = 0; r < 3; r++)
    for(int ch = 0; ch < 3; ch++) p.curves[r][ch] = flat_curve();
  p.white_level = 1.f;
  p.sigma_L = 50.f;
  p.sigma_rho = 1.f;
  p.sigma_theta = 0.40f;
  p.neutral_protection = 0.05f;
  p.interpolation = 0;
  return p;
}

struct Field
{
  float anchor_L[4][64], anchor_rho[4][64], anchor_theta[4][64], delta_L[4][64], chroma_scale[4][64], delta_theta[4][64];
  float inv_sigma_L, inv_sigma_rho, inv_sigma_theta, rho0;
};

static float g_reference_saturation[3] = { 0.f, 0.f, 0.f };

// _build_clut's anchor loop, then the axis ring and the smoothing radii.
static void build_field(const RefParams &p, Field &f)
{
  const float white = dt_colorrings_graph_white();
  for(int ring = 0; ring < 4; ring++)
    for(int h = 0; h < 64; h++)
    {
      f.anchor_L[ring][h] = f.anchor_rho[ring][h] = f.anchor_theta[ring][h] = 0.f;
      f.delta_L[ring][h] = f.delta_theta[ring][h] = 0.f;
      f.chroma_scale[ring][h] = 1.f;
    }

  for(int ring = 0; ring < 3; ring++)
  {
    const float brightness = dt_colorrings_ring_brightness(ring);
    const float reference_saturation = g_reference_saturation[ring];
    dt_aligned_pixel_t neutral_rgb = { 0.f };
    dt_colorrings_brightness_to_axis_rgb(brightness, white, neutral_rgb);

    for(int hue_sample = 0; hue_sample < 64; hue_sample++)
    {
      const float x = (float)hue_sample / 64.f;
      const float hue = dt_colorrings_curve_x_to_hue(x);
      const auto &hueCurve = p.curves[ring][CH_HUE];
      const auto &satCurve = p.curves[ring][CH_SATURATION];
      const auto &briCurve = p.curves[ring][CH_BRIGHTNESS];
      const float hue_shift = _channel_value_from_y(CH_HUE, dt_colorrings_curve_periodic_sample(hueCurve.data(), (int)hueCurve.size(), x));
      const float sat_gain = _channel_value_from_y(CH_SATURATION, dt_colorrings_curve_periodic_sample(satCurve.data(), (int)satCurve.size(), x));
      const float bright_gain = _channel_value_from_y(CH_BRIGHTNESS, dt_colorrings_curve_periodic_sample(briCurve.data(), (int)briCurve.size(), x));

      const dt_aligned_pixel_t before_hsb = { hue, reference_saturation, brightness, 0.f };
      const dt_aligned_pixel_t after_hsb
          = { dt_colorrings_wrap_hue_pi(hue + hue_shift), CLAMP(reference_saturation * sat_gain, 0.f, 1.f),
              CLAMP(brightness * bright_gain, 0.f, 1.f), 0.f };

      dt_aligned_pixel_t before_rgb = { 0.f };
      dt_aligned_pixel_t after_rgb = { 0.f };
      dt_colorrings_hsb_to_profile_rgb(before_hsb, white, before_rgb);
      dt_colorrings_hsb_to_profile_rgb(after_hsb, white, after_rgb);
      dt_colorrings_project_to_cube_shell(neutral_rgb, before_rgb);
      dt_colorrings_project_to_cube_shell(neutral_rgb, after_rgb);

      float Lp, rhop, thetap;
      float La, rhoa;
      float unused_theta;
      dt_colorrings_rgb_to_gray_cyl(before_rgb, &Lp, &rhop, &thetap);
      dt_colorrings_rgb_to_gray_cyl(after_rgb, &La, &rhoa, &unused_theta);

      const float requested_scale = sat_gain;
      const float projected_scale = (rhop > 1e-6f) ? (rhoa / rhop) : 1.f;
      const float effective_scale
          = (requested_scale <= 1.f) ? requested_scale : fminf(requested_scale, projected_scale);

      f.anchor_L[ring][hue_sample] = Lp;
      f.anchor_rho[ring][hue_sample] = rhop;
      f.anchor_theta[ring][hue_sample] = thetap;
      f.delta_L[ring][hue_sample] = La - Lp;
      f.chroma_scale[ring][hue_sample] = effective_scale;
      f.delta_theta[ring][hue_sample] = dt_colorrings_wrap_pi(hue_shift);
    }
  }

  for(int sample = 0; sample < 64; sample++)
  {
    const float value = (float)sample / 63.f;
    f.anchor_L[3][sample] = value * 1.7320508075688772f;
    f.anchor_rho[3][sample] = 0.f;
    f.anchor_theta[3][sample] = 0.f;
    f.delta_L[3][sample] = 0.f;
    f.chroma_scale[3][sample] = 1.f;
    f.delta_theta[3][sample] = 0.f;
  }

  const float sigma_L = fmaxf(p.sigma_L * 0.01f, 1e-6f);
  const float sigma_rho = fmaxf(p.sigma_rho, 1e-6f);
  const float sigma_theta = fmaxf(p.sigma_theta, 1e-6f);
  const float neutral_protection = fmaxf(p.neutral_protection, 0.f);
  f.inv_sigma_L = 1.f / sigma_L;
  f.inv_sigma_rho = 1.f / sigma_rho;
  f.inv_sigma_theta = 1.f / sigma_theta;
  f.rho0 = neutral_protection * sigma_rho;
}

static std::vector<float> build_lut(const Field &f, const int level)
{
  std::vector<float> lut((size_t)level * level * level * 3);
  dt_colorrings_fill_lut_local_field(lut.data(), level, f.anchor_L, f.anchor_rho, f.anchor_theta, f.delta_L,
                                     f.chroma_scale, f.delta_theta, f.inv_sigma_L, f.inv_sigma_rho, f.inv_sigma_theta,
                                     f.rho0);
  return lut;
}

// process(): white level, work (linear sRGB) → HLG Rec2020, the table, back.
static void process_pixel(const float in[3], const float white_level_ev, const std::vector<float> &lut, const int level,
                          const int interpolation, float out[3])
{
  const float white_level = fmaxf(exp2f(white_level_ev), 1e-6f);
  dt_aligned_pixel_t work = { in[0] / white_level, in[1] / white_level, in[2] / white_level, 0.f };
  dt_aligned_pixel_t XYZ = { 0.f };
  dt_aligned_pixel_t code = { 0.f };
  dt_Rec709_to_XYZ_D50(work, XYZ);
  xyz_d50_to_lut_rgb(XYZ, code);
  dt_aligned_pixel_t mapped = { 0.f };
  dt_lut3d_apply(code, mapped, 1, lut.data(), (uint16_t)level, 1.f, (dt_lut3d_interpolation_t)interpolation);
  lut_rgb_to_xyz_d50(mapped, XYZ);
  dt_aligned_pixel_t rgb = { 0.f };
  dt_XYZ_to_Rec709_D50(XYZ, rgb);
  for(int c = 0; c < 3; c++) out[c] = rgb[c] * white_level;
}

// ── JSON output ──────────────────────────────────────────────────────────────

static void jf(const float v) { printf("%.9g", (double)v); }
static void jv3(const float *v) { printf("["); jf(v[0]); printf(","); jf(v[1]); printf(","); jf(v[2]); printf("]"); }

static uint32_t lcg_state = 12345u;
static float lcg()
{
  lcg_state = 1103515245u * lcg_state + 12345u;
  return (float)((lcg_state >> 8) & 0x7fffffu) / (float)0x800000u;   // [0, 1)
}

static void print_curves(const RefParams &p)
{
  printf("[");
  for(int r = 0; r < 3; r++)
  {
    printf(r ? ",[" : "[");
    for(int ch = 0; ch < 3; ch++)
    {
      printf(ch ? ",[" : "[");
      for(size_t k = 0; k < p.curves[r][ch].size(); k++)
      {
        printf(k ? ",[" : "[");
        jf(p.curves[r][ch][k].x); printf(","); jf(p.curves[r][ch][k].y); printf("]");
      }
      printf("]");
    }
    printf("]");
  }
  printf("]");
}

static void print_params(const RefParams &p)
{
  printf("{\"curves\":");
  print_curves(p);
  printf(",\"whiteLevel\":"); jf(p.white_level);
  printf(",\"sigmaL\":"); jf(p.sigma_L);
  printf(",\"sigmaRho\":"); jf(p.sigma_rho);
  printf(",\"sigmaTheta\":"); jf(p.sigma_theta);
  printf(",\"neutralProtection\":"); jf(p.neutral_protection);
  printf(",\"interpolation\":%d}", p.interpolation);
}

int main()
{
  build_rec2020_d50();
  const float white = dt_colorrings_graph_white();
  dt_colorrings_compute_reference_saturations(white, g_reference_saturation);

  // Parameter sets A, B, C (see the plan).
  RefParams A = default_params();
  A.curves[1][CH_SATURATION] = { { 0.f, .5f }, { .125f, .5f }, { .25f, .6f }, { .375f, .9f }, { .5f, .85f }, { .625f, .6f }, { .75f, .5f }, { .875f, .5f } };

  RefParams B = default_params();
  B.curves[2][CH_HUE] = { { 0.f, .5f }, { .125f, .35f }, { .25f, .3f }, { .375f, .5f }, { .5f, .5f }, { .625f, .65f }, { .75f, .7f }, { .875f, .5f } };
  B.curves[0][CH_BRIGHTNESS] = { { 0.f, .4f }, { .125f, .3f }, { .25f, .25f }, { .375f, .3f }, { .5f, .4f }, { .625f, .5f }, { .75f, .5f }, { .875f, .45f } };
  B.sigma_L = 30.f; B.sigma_rho = 0.6f; B.sigma_theta = 0.8f; B.neutral_protection = 0.5f; B.white_level = 0.5f; B.interpolation = 1;

  RefParams C = default_params();
  C.curves[1][CH_HUE].clear();
  for(int k = 0; k < 12; k++) C.curves[1][CH_HUE].push_back({ (float)k / 12.f, 0.5f + 0.3f * sinf(2.f * M_PI_F * (float)k / 12.f) });
  C.curves[2][CH_SATURATION] = { { 0.05f, .2f }, { 0.4f, .9f } };
  C.curves[0][CH_SATURATION] = { { 0.f, .5f }, { .3f, .5f }, { .7f, .5f } };
  C.sigma_theta = 2.0f; C.neutral_protection = 0.f; C.white_level = 2.f; C.interpolation = 2;

  const RefParams sets[3] = { A, B, C };

  printf("{\n\"spline\":[");
  {
    std::vector<std::vector<dt_colorrings_node_t>> node_sets;
    node_sets.push_back(flat_curve());
    node_sets.push_back({ { 0.f, .5f }, { .3f, .5f }, { .7f, .5f } });
    node_sets.push_back(A.curves[1][CH_SATURATION]);
    node_sets.push_back(C.curves[1][CH_HUE]);
    std::vector<dt_colorrings_node_t> twenty;
    for(int k = 0; k < 20; k++) twenty.push_back({ (float)k / 20.f + 0.01f * (float)(k % 3), 0.5f + 0.4f * cosf(3.f * 2.f * M_PI_F * (float)k / 20.f) });
    node_sets.push_back(twenty);
    node_sets.push_back({ { 0.02f, .1f }, { 0.5f, .9f }, { 0.98f, .2f } });
    for(size_t s = 0; s < node_sets.size(); s++)
    {
      const auto &nodes = node_sets[s];
      printf(s ? ",{\"nodes\":[" : "{\"nodes\":[");
      for(size_t k = 0; k < nodes.size(); k++) { printf(k ? ",[" : "["); jf(nodes[k].x); printf(","); jf(nodes[k].y); printf("]"); }
      printf("],\"samples\":[");
      for(int i = 0; i < 64; i++)
      {
        const float x = (float)i / 64.f;
        printf(i ? ",[" : "["); jf(x); printf(","); jf(dt_colorrings_curve_periodic_sample(nodes.data(), (int)nodes.size(), x)); printf("]");
      }
      printf("]}");
    }
  }
  printf("],\n\"hsb\":[");
  {
    int n = 0;
    for(int ring = 0; ring < 3; ring++)
      for(int i = 0; i < 15; i++)
      {
        const dt_aligned_pixel_t HSB = { dt_colorrings_curve_x_to_hue((float)i / 15.f), g_reference_saturation[ring], dt_colorrings_ring_brightness(ring), 0.f };
        dt_aligned_pixel_t xyz = { 0.f }, lutRgb = { 0.f }, preview = { 0.f }, display = { 0.f };
        dt_UCS_HSB_to_XYZ(HSB, white, xyz);
        dt_colorrings_hsb_to_profile_rgb(HSB, white, lutRgb);
        _dt_ucs_hsb_to_preview_rgb_unclamped(HSB, white, preview);
        dt_colorrings_hsb_to_display_rgb(HSB, white, display);
        printf(n++ ? ",{\"hsb\":" : "{\"hsb\":"); jv3(HSB);
        printf(",\"xyz\":"); jv3(xyz);
        printf(",\"lutRgb\":"); jv3(lutRgb);
        printf(",\"previewSrgb\":"); jv3(preview);
        printf(",\"displaySrgb\":"); jv3(display);
        printf("}");
      }
  }
  printf("],\n\"referenceSaturation\":"); jv3(g_reference_saturation);
  printf(",\n\"axisRgb\":[");
  for(int ring = 0; ring < 3; ring++) { if(ring) printf(","); jf(dt_colorrings_ring_axis_position_from_brightness(dt_colorrings_ring_brightness(ring), white)); }
  printf("],\n\"params\":[");
  for(int s = 0; s < 3; s++) { if(s) printf(","); print_params(sets[s]); }

  Field fields[3];
  for(int s = 0; s < 3; s++) build_field(sets[s], fields[s]);

  printf("],\n\"anchors\":[");
  for(int s = 0; s < 3; s++)
  {
    printf(s ? ",[" : "[");
    for(int a = 0; a < 192; a++)
    {
      const int ring = a / 64, h = a % 64;
      const float v[6] = { fields[s].anchor_L[ring][h], fields[s].anchor_rho[ring][h], fields[s].anchor_theta[ring][h],
                           fields[s].delta_L[ring][h], fields[s].chroma_scale[ring][h], fields[s].delta_theta[ring][h] };
      printf(a ? ",[" : "[");
      for(int i = 0; i < 6; i++) { if(i) printf(","); jf(v[i]); }
      printf("]");
    }
    printf("]");
  }
  printf("],\n\"field\":[");
  for(int s = 0; s < 3; s++)
  {
    lcg_state = 12345u + (uint32_t)s;
    printf(s ? ",{\"points\":[" : "{\"points\":[");
    std::vector<float> pts;
    for(int i = 0; i < 200; i++)
      for(int c = 0; c < 3; c++) pts.push_back((float)((int)(lcg() * 64.f) % 64) / 63.f);
    for(int i = 0; i < 200; i++) { printf(i ? ",[" : "["); jf(pts[i * 3]); printf(","); jf(pts[i * 3 + 1]); printf(","); jf(pts[i * 3 + 2]); printf("]"); }
    printf("],\"out\":[");
    for(int i = 0; i < 200; i++)
    {
      float d[3];
      const Field &f = fields[s];
      dt_colorrings_eval_local_field(&pts[i * 3], f.anchor_L, f.anchor_rho, f.anchor_theta, f.delta_L, f.chroma_scale, f.delta_theta,
                                     f.inv_sigma_L, f.inv_sigma_rho, f.inv_sigma_theta, f.rho0, d);
      printf(i ? ",[" : "["); jf(d[0]); printf(","); jf(d[1]); printf(","); jf(d[2]); printf("]");
    }
    printf("]}");
  }

  const std::vector<float> lutA16 = build_lut(fields[0], 16);
  printf("],\n\"lut16\":[");
  for(size_t i = 0; i < lutA16.size(); i++) { if(i) printf(","); jf(lutA16[i]); }
  printf("],\n\"apply\":{\"level\":16,\"inputs\":[");
  {
    lcg_state = 777u;
    std::vector<float> inputs;
    for(int i = 0; i < 40; i++) for(int c = 0; c < 3; c++) inputs.push_back(lcg());
    for(int i = 0; i < 10; i++) for(int c = 0; c < 3; c++) inputs.push_back(-0.2f + 1.5f * lcg());
    for(int i = 0; i < 50; i++) { if(i) printf(","); jv3(&inputs[i * 3]); }
    const char *names[3] = { "tetrahedral", "trilinear", "pyramid" };
    for(int mode = 0; mode < 3; mode++)
    {
      printf("],\"%s\":[", names[mode]);
      for(int i = 0; i < 50; i++)
      {
        const dt_aligned_pixel_t in = { inputs[i * 3], inputs[i * 3 + 1], inputs[i * 3 + 2], 0.f };
        dt_aligned_pixel_t out = { 0.f };
        dt_lut3d_apply(in, out, 1, lutA16.data(), 16, 1.f, (dt_lut3d_interpolation_t)mode);
        if(i) printf(","); jv3(out);
      }
    }
  }
  printf("]},\n\"pixels\":[");
  {
    lcg_state = 4242u;
    std::vector<float> pixels;
    for(int i = 0; i < 54; i++) for(int c = 0; c < 3; c++) pixels.push_back(1.6f * lcg());
    for(int i = 0; i < 6; i++) { const float g = 0.02f + 0.3f * (float)i; pixels.push_back(g); pixels.push_back(g); pixels.push_back(g); }
    for(int s = 0; s < 3; s++)
    {
      const std::vector<float> lut = build_lut(fields[s], 32);
      printf(s ? ",{\"set\":%d,\"level\":32,\"whiteLevel\":" : "{\"set\":%d,\"level\":32,\"whiteLevel\":", s); jf(sets[s].white_level);
      printf(",\"interpolation\":%d,\"in\":[", sets[s].interpolation);
      for(int i = 0; i < 60; i++) { if(i) printf(","); jv3(&pixels[i * 3]); }
      printf("],\"out\":[");
      for(int i = 0; i < 60; i++)
      {
        float out[3];
        process_pixel(&pixels[i * 3], sets[s].white_level, lut, 32, sets[s].interpolation, out);
        if(i) printf(","); jv3(out);
      }
      printf("]}");
    }
  }
  printf("]\n}\n");
  return 0;
}
