// The dense displacement field and the table built from it, transcribed
// from Ansel's pixel/colorequal_shared.c and pixel/lut3d.c (© Aurélien
// Pierre, GPL-3.0-or-later).
//
// A lattice point finds the anchors inside its smoothing ellipsoid, averages
// their displacements with the Wendland C2 kernel, fades that below the
// neutral-protection radius, applies it in the grey-cylindrical frame and
// projects back onto the cube shell. The table stores the result as a
// displacement from the lattice point rather than the absolute value Ansel
// stores: the interpolations all reproduce affine functions, so the lookups
// agree, and a small signed number survives a half-float target far better
// than a whole code value would.

import { wrapPi } from "./curve";
import { grayAxisRgbFromL, grayBasisToRgb, projectToCubeShell, rgbToGrayCyl } from "./cube";
import type { Anchor } from "./rings";
import { FLT_MIN, type Vec3 } from "./ucs";

export { grayAxisRgbFromL, grayBasisToRgb, rgbToGrayCyl } from "./cube";

export const MAX_LUT_LEVEL = 64;

export type Interpolation = 0 | 1 | 2;
export const INTERPOLATIONS = ["tetrahedral", "trilinear", "pyramid"] as const;

export interface FieldParams {
  invSigmaL: number;
  invSigmaRho: number;
  invSigmaTheta: number;
  /** neutral protection · σ_ρ: the chroma below which the field fades out. */
  rho0: number;
}

/** dt_colorrings_wendland_c2. */
export function wendlandC2(d: number): number {
  if (d >= 1) return 0;
  const t = 1 - d;
  return t * t * t * t * (4 * d + 1);
}

/** dt_colorrings_eval_local_field: the displacement of lattice point `x`. */
export function evalLocalField(x: Vec3, anchors: readonly Anchor[], f: FieldParams): Vec3 {
  const cyl = rgbToGrayCyl(x);
  if (cyl.rho <= 1e-6) return [0, 0, 0];
  let sumW = 0;
  let sumDL = 0;
  let sumScale = 0;
  let sumDTheta = 0;
  for (const a of anchors) {
    const dL = (cyl.L - a.L) * f.invSigmaL;
    const dr = (cyl.rho - a.rho) * f.invSigmaRho;
    const dh = wrapPi(cyl.theta - a.theta) * f.invSigmaTheta;
    const d2 = dL * dL + dr * dr + dh * dh;
    if (d2 >= 1) continue;
    const w = a.weight * wendlandC2(Math.sqrt(d2));
    sumW += w;
    sumDL += w * a.deltaL;
    sumScale += w * a.chromaScale;
    sumDTheta += w * a.deltaTheta;
  }
  if (sumW <= FLT_MIN) return [0, 0, 0];
  const deltaL = sumDL / sumW;
  const scale = sumScale / sumW;
  const deltaTheta = sumDTheta / sumW;
  if (Math.abs(deltaL) <= 1e-6 && Math.abs(scale - 1) <= 1e-6 && Math.abs(deltaTheta) <= 1e-6) return [0, 0, 0];
  // ρ₀ = 0 (no neutral protection) is the C's division by zero: α = 1.
  const t = f.rho0 > 0 ? Math.min(Math.max(cyl.rho / f.rho0, 0), 1) : 1;
  const alpha = t * t * (3 - 2 * t);
  const L = cyl.L + alpha * deltaL;
  const rho = cyl.rho * Math.max(1 + alpha * (scale - 1), 0);
  const theta = cyl.theta + alpha * deltaTheta;
  const grey = grayAxisRgbFromL(L);
  const target = projectToCubeShell([grey, grey, grey], grayBasisToRgb(L, rho * Math.cos(theta), rho * Math.sin(theta)));
  return [target[0] - x[0], target[1] - x[1], target[2] - x[2]];
}

/** The largest table level ≤ 64 whose cube of lattice texels fits a target
 *  of `texels`, never below 2. The GLSL computes the same from the target
 *  size, so the two agree without a uniform. */
export function lutLevel(texels: number): number {
  let level = Math.min(MAX_LUT_LEVEL, Math.floor(Math.cbrt(Math.max(texels, 1))) + 1);
  for (let k = 0; k < 3; k++) if (level * level * level > texels) level--;
  return Math.max(2, level);
}

/** Lattice index, red fastest: Ansel's `(b·level + g)·level + r`. */
export function lutIndex(r: number, g: number, b: number, level: number): number {
  return (b * level + g) * level + r;
}

/** dt_colorrings_fill_lut_local_field, stored as `clamp(x + d, 0, 1) − x`. */
export function fillDisplacementTable(level: number, anchors: readonly Anchor[], f: FieldParams): Float32Array {
  const table = new Float32Array(level * level * level * 3);
  const step = 1 / (level - 1);
  for (let b = 0; b < level; b++) {
    for (let g = 0; g < level; g++) {
      for (let r = 0; r < level; r++) {
        const x: Vec3 = [r * step, g * step, b * step];
        const d = evalLocalField(x, anchors, f);
        const i = lutIndex(r, g, b, level) * 3;
        for (let c = 0; c < 3; c++) {
          const v = x[c] + d[c];
          table[i + c] = (v < 0 ? 0 : v > 1 ? 1 : v) - x[c];
        }
      }
    }
  }
  return table;
}

/** lut3d.c's lookup: the input clamped to the cube with the excess kept as a
 *  residual, one of the three interpolations over the corners, then the
 *  residual restored. */
export function applyDisplacementTable(rgb: Vec3, table: Float32Array, level: number, mode: Interpolation): Vec3 {
  const n = [0, 0, 0];
  const residual = [0, 0, 0];
  const frac = [0, 0, 0];
  const idx = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    n[c] = rgb[c] < 0 ? 0 : rgb[c] > 1 ? 1 : rgb[c];
    residual[c] = rgb[c] - n[c];
    const scaled = n[c] * (level - 1);
    const i = Math.trunc(scaled);
    idx[c] = i < 0 ? 0 : i > level - 2 ? level - 2 : i;
    frac[c] = scaled - idx[c];
  }
  const level2 = level * level;
  const color = idx[0] + idx[1] * level + idx[2] * level2;
  const corner = (offset: number, c: number): number => table[(color + offset) * 3 + c];
  const [r, g, b] = frac;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c000 = corner(0, c);
    const c100 = corner(1, c);
    const c010 = corner(level, c);
    const c110 = corner(level + 1, c);
    const c001 = corner(level2, c);
    const c101 = corner(level2 + 1, c);
    const c011 = corner(level + level2, c);
    const c111 = corner(level + level2 + 1, c);
    let d: number;
    if (mode === 1) {
      const x00 = c000 * (1 - r) + c100 * r;
      const x10 = c010 * (1 - r) + c110 * r;
      const x01 = c001 * (1 - r) + c101 * r;
      const x11 = c011 * (1 - r) + c111 * r;
      d = (x00 * (1 - g) + x10 * g) * (1 - b) + (x01 * (1 - g) + x11 * g) * b;
    } else if (mode === 2) {
      if (g > r && b > r) {
        d = c000 + (c111 - c011) * r + (c010 - c000) * g + (c001 - c000) * b + (c011 - c001 - c010 + c000) * g * b;
      } else if (r > g && b > g) {
        d = c000 + (c100 - c000) * r + (c111 - c101) * g + (c001 - c000) * b + (c101 - c001 - c100 + c000) * r * b;
      } else {
        d = c000 + (c100 - c000) * r + (c010 - c000) * g + (c111 - c110) * b + (c110 - c100 - c010 + c000) * r * g;
      }
    } else if (r > g) {
      if (g > b) d = (1 - r) * c000 + (r - g) * c100 + (g - b) * c110 + b * c111;
      else if (r > b) d = (1 - r) * c000 + (r - b) * c100 + (b - g) * c101 + g * c111;
      else d = (1 - b) * c000 + (b - r) * c001 + (r - g) * c101 + g * c111;
    } else if (b > g) {
      d = (1 - b) * c000 + (b - g) * c001 + (g - r) * c011 + r * c111;
    } else if (b > r) {
      d = (1 - g) * c000 + (g - b) * c010 + (b - r) * c011 + r * c111;
    } else {
      d = (1 - g) * c000 + (g - r) * c010 + (r - b) * c110 + b * c111;
    }
    out[c] = n[c] + d + residual[c];
  }
  return [out[0], out[1], out[2]];
}
