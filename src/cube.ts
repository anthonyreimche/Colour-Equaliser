// The RGB cube as Ansel's colour equalizer sees it (pixel/colorequal_shared.c,
// © Aurélien Pierre, GPL-3.0-or-later): a grey-cylindrical frame — L along
// the grey diagonal, ρ off it, θ around it — and the projection that keeps a
// colour inside the unit cube along the ray from a point on the diagonal.

import type { Vec3 } from "./ucs";

const E_L = 0.5773502691896258;
const E_U = 0.7071067811865475;
const E_V = 0.408248290463863;
const E_V_B = -0.816496580927726;

export interface GrayCyl {
  L: number;
  rho: number;
  theta: number;
}

/** dt_colorrings_rgb_to_gray_cyl. */
export function rgbToGrayCyl(rgb: Vec3): GrayCyl {
  const L = (rgb[0] + rgb[1] + rgb[2]) * E_L;
  const u = (rgb[0] - rgb[1]) * E_U;
  const v = rgb[0] * E_V + rgb[1] * E_V + rgb[2] * E_V_B;
  return { L, rho: Math.sqrt(u * u + v * v), theta: Math.atan2(v, u) };
}

/** dt_colorrings_gray_basis_to_rgb. */
export function grayBasisToRgb(L: number, u: number, v: number): Vec3 {
  return [L * E_L + u * E_U + v * E_V, L * E_L - u * E_U + v * E_V, L * E_L + v * E_V_B];
}

/** dt_colorrings_gray_axis_rgb_from_L: the grey at diagonal position L. */
export function grayAxisRgbFromL(L: number): number {
  return L * E_L;
}

/** dt_colorrings_distance_to_cube_shell: how far along `direction` from
 *  `axis` the unit cube's face lies (0 when no face is ahead). */
export function distanceToCubeShell(axis: Vec3, direction: Vec3): number {
  let distance = Infinity;
  for (let c = 0; c < 3; c++) {
    if (Math.abs(direction[c]) < 1e-6) continue;
    const bound = direction[c] > 0 ? 1 : 0;
    const candidate = (bound - axis[c]) / direction[c];
    if (candidate > 0 && candidate < distance) distance = candidate;
  }
  return Number.isFinite(distance) ? distance : 0;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** dt_colorrings_project_to_cube_shell. */
export function projectToCubeShell(axis: Vec3, rgb: Vec3): Vec3 {
  const v: Vec3 = [rgb[0] - axis[0], rgb[1] - axis[1], rgb[2] - axis[2]];
  if (Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) < 1e-6) return rgb;
  const scale = distanceToCubeShell(axis, v);
  const out: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
  if (scale < 1) for (let c = 0; c < 3; c++) out[c] = axis[c] + scale * v[c];
  return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])];
}
