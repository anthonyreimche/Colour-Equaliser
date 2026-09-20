// The GPU side: Ansel's colour equalizer as one stage in the host's
// scene-linear phase, on the stage/prepass framework.
//
// Ansel builds a 64³ table when the parameters change and applies it per
// pixel. Here two prepass draws build the table from the curve nodes — an
// *anchors* draw (192 ring anchors, two texels each) and a *lattice* draw
// (the displacement of every lattice point, plus a marker texel) — and the
// inline block takes each pixel to HLG Rec2020 code values, interpolates the
// table and comes back. The host caches a prepass result until one of its
// pass keys changes, so a node drag rebuilds the table (~2 ms of work) and
// everything else is a cache hit; the inline reads the pixel's live
// scene-linear value, after exposure and white balance.
//
// The prepass target is the frame, so the table's level adapts to it (64
// whenever the frame has 262144 texels, smaller only for tiny renders) —
// the same integer arithmetic on the CPU and in GLSL. The inline reads the
// host's prepass result sampler by the host's own name
// (`u_{prefix}stageResult`, the 4-char prefix the sibling ports already
// mirror to salt ids) and hands it to the lookup helpers as a parameter.
// The marker texel guards every way that sampler can hold something other
// than this table — the stage starved of a prepass unit, a failed pass, an
// 8-bit target — and the pixel then passes through untouched.

import { CHANNELS, DEFAULT_NODES, defaultCurve } from "./curve";
import { ANCHORS_GLSL, COLOUR_GLSL, CURVE_GLSL, LATTICE_GLSL, LUT_GLSL, RING_GLSL, inlineGlsl } from "./glsl";
import { DEFAULT_PARAMS } from "./model";
import { CHANNEL_KEY, CHUNKS, STAGE_ID, packCurve, stagePrefix4 } from "./params";
import { HUE_SAMPLES, RINGS } from "./rings";
import type { ProcessingStageContribution, StagePass, UniformDeclaration } from "./safelight";

/** Ring anchors × two texels. */
export const ANCHOR_TEXELS = 3 * HUE_SAMPLES * 2;
/** Written at lattice index level³; impossible for image data or an 8-bit target. */
export const MARKER: readonly [number, number, number] = [-1, 0.5, -1];

/** The host's name for a stage's prepass result sampler. */
export function resultSampler(stageId: string): string {
  return `u_${stagePrefix4(stageId)}_stageResult`;
}

function curveUniforms(): UniformDeclaration[] {
  const out: UniformDeclaration[] = [];
  const { chunks } = packCurve(defaultCurve());
  for (const ring of RINGS) {
    for (const channel of CHANNELS) {
      const name = `${ring}${CHANNEL_KEY[channel]}`;
      for (let c = 0; c < CHUNKS; c++) out.push({ key: `${name}${c}`, glslType: "vec4", default: [...chunks[c]] });
      out.push({ key: `${name}Count`, glslType: "int", default: DEFAULT_NODES });
    }
  }
  return out;
}

export function anchorsPass(): StagePass {
  return {
    glsl: ANCHORS_GLSL,
    helpers: `${COLOUR_GLSL}\n${RING_GLSL}\n${CURVE_GLSL}`,
    iterations: 1,
    uniforms: curveUniforms(),
  };
}

const d = DEFAULT_PARAMS;

export function latticePass(): StagePass {
  return {
    glsl: LATTICE_GLSL,
    helpers: `${COLOUR_GLSL}\n${LUT_GLSL}`,
    iterations: 1,
    uniforms: [
      { key: "sigmaL", glslType: "float", default: d.sigmaL, range: { min: 1, max: 100, step: 1 }, label: "brightness smoothing" },
      { key: "sigmaRho", glslType: "float", default: d.sigmaRho, range: { min: 0.01, max: 2, step: 0.01 }, label: "saturation smoothing" },
      { key: "sigmaTheta", glslType: "float", default: d.sigmaTheta, range: { min: 0.01, max: 6.28318531, step: 0.01 }, label: "hue smoothing" },
      { key: "neutralProtection", glslType: "float", default: d.neutralProtection, range: { min: 0, max: 2, step: 0.01 }, label: "neutral protection" },
    ],
  };
}

export function ringsStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Colour Equaliser",
    // Ansel: after colour balance, before filmic.
    phase: "scene-linear",
    priority: 85,
    glsl: inlineGlsl(resultSampler(STAGE_ID)),
    helpers: `${COLOUR_GLSL}\n${LUT_GLSL}`,
    uniforms: [
      { key: "whiteLevel", glslType: "float", default: d.whiteLevel, range: { min: -2, max: 8, step: 0.01 }, label: "white level" },
      { key: "interpolation", glslType: "int", default: d.interpolation, range: { min: 0, max: 2, step: 1 }, label: "interpolation" },
      { key: "on", glslType: "float", default: 0 },
    ],
    passes: [anchorsPass(), latticePass()],
    presetScope: "global",
  };
}

export function allStages(): ProcessingStageContribution[] {
  return [ringsStage()];
}

/** Uniform vectors a pass declares, in the GLSL ES budget's units: a scalar
 *  or a vector takes one, a sampler none. */
export function uniformVectors(pass: StagePass): number {
  return (pass.uniforms ?? []).reduce((n, u) => n + (u.glslType === "sampler2D" ? 0 : 1), 0);
}
