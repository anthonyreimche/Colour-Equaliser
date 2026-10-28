// The GPU stage as a contract: which keys it declares with which defaults
// (the bag bridge relies on them), that the GLSL is formatted from the
// model's constants, that the inline reads the host's prepass result sampler
// by the host's own name and only from the block, and the per-draw
// texture-fetch budgets on the real GLSL — the class of cost the CPU
// reference never sees.

import { describe, expect, it } from "vitest";
import { glslLiteral } from "../src/glsl";
import { CHUNKS, KEY, STAGE_ID, curveKeys, stagePrefix4 } from "../src/params";
import { REFERENCE_SATURATION } from "../src/rings";
import {
  ANCHOR_TEXELS,
  MARKER,
  allStages,
  anchorsPass,
  latticePass,
  resultSampler,
  ringsStage,
  uniformVectors,
} from "../src/stage";
import { CAT16_D65_TO_D50, HLG, L_WHITE } from "../src/ucs";
import { fetchBudget, inlineFetches } from "./support/fetch-budget";

const unqualified = (k: string) => k.slice(STAGE_ID.length + 1);

describe("glslLiteral", () => {
  it("always carries a decimal point, exponents included", () => {
    expect(glslLiteral(0.5)).toBe("0.5000000000");
    expect(glslLiteral(64)).toBe("64.00000000");
    expect(glslLiteral(1.17549435e-38)).toMatch(/^1\.17549435\d*e-38$/);
    expect(glslLiteral(-0.98)).toBe("-0.9800000000");
  });
});

describe("ringsStage", () => {
  const stage = ringsStage();
  const anchors = anchorsPass();
  const lattice = latticePass();

  it("runs again inside masks", () => {
    expect(stage.mask).toEqual({ maskable: true });
  });

  it("is one scene-linear stage after the sibling colour ports, in presets", () => {
    expect(stage.id).toBe(STAGE_ID);
    expect(stage.name).toBe("Colour Equaliser");
    expect(stage.phase).toBe("scene-linear");
    expect(stage.priority).toBe(85);
    expect(stage.presetScope).toBe("global");
    expect(allStages().map((s) => s.id)).toEqual([STAGE_ID]);
    expect(stage.passes?.length).toBe(2);
    expect(stage.passes?.[0].iterations ?? 1).toBe(1);
    expect(stage.passes?.[1].iterations ?? 1).toBe(1);
  });

  it("declares the curve chunks and counts on the anchors pass, the radii on the lattice pass, the rest inline", () => {
    const anchorKeys = (anchors.uniforms ?? []).map((u) => u.key);
    expect(anchorKeys).toEqual(curveKeys().map(unqualified));
    const byKey = Object.fromEntries((anchors.uniforms ?? []).map((u) => [u.key, u]));
    expect(byKey.shadowsHue0.glslType).toBe("vec4");
    expect(byKey.shadowsHue0.default).toEqual([0, 0.5, 0.125, 0.5]);
    expect(byKey.shadowsHue4.default).toEqual([0, 0, 0, 0]);
    expect(byKey.shadowsHueCount.glslType).toBe("int");
    expect(byKey.shadowsHueCount.default).toBe(8);
    expect((lattice.uniforms ?? []).map((u) => [u.key, u.default])).toEqual([
      ["sigmaL", 50],
      ["sigmaRho", 1],
      ["sigmaTheta", 0.4],
      ["neutralProtection", 0.05],
    ]);
    expect(stage.uniforms.map((u) => [u.key, u.glslType, u.default])).toEqual([
      ["whiteLevel", "float", 1],
      ["interpolation", "int", 0],
      ["on", "float", 0],
    ]);
    const all = [...anchorKeys, ...(lattice.uniforms ?? []).map((u) => u.key), ...stage.uniforms.map((u) => u.key)];
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(9 * (CHUNKS + 1) + 7);
    expect(Object.values(KEY).map(unqualified)).toEqual(["whiteLevel", "sigmaL", "sigmaRho", "sigmaTheta", "neutralProtection", "interpolation", "on"]);
  });

  it("fits the anchors pass in the guaranteed uniform budget", () => {
    expect(uniformVectors(anchors)).toBe(99);
    expect(uniformVectors(anchors)).toBeLessThanOrEqual(120);
  });

  it("formats the GLSL from the model's constants", () => {
    const glsl = [anchors.helpers, anchors.glsl, lattice.helpers, lattice.glsl, stage.helpers, stage.glsl].join("\n");
    expect(glsl).toContain(glslLiteral(L_WHITE));
    expect(glsl).toContain(glslLiteral(REFERENCE_SATURATION.midtones));
    expect(glsl).toContain(glslLiteral(HLG.a));
    expect(glsl).toContain(glslLiteral(CAT16_D65_TO_D50[8]));
    expect(glsl).toContain(glslLiteral(20));
  });

  it("names the host's prepass result sampler in the block only, as a parameter to the helpers", () => {
    const sampler = resultSampler(STAGE_ID);
    expect(sampler).toBe(`u_${stagePrefix4(STAGE_ID)}_stageResult`);
    expect(sampler).toMatch(/^u_[0-9a-z]{4}_stageResult$/);
    expect(stage.glsl).toContain(sampler);
    expect(stage.helpers ?? "").not.toContain("stageResult");
    expect(stage.helpers ?? "").toMatch(/sampler2D\s+\w+/);
    expect(stage.glsl).toMatch(/if \(on > 0\.5\)/);
    expect(stage.glsl).toContain("textureSize(");
  });

  it("marks the table and writes anchors in two texels each", () => {
    expect(ANCHOR_TEXELS).toBe(384);
    expect(MARKER).toEqual([-1, 0.5, -1]);
    expect(anchors.glsl).toContain("384");
    expect(lattice.glsl).toContain(`vec3(${glslLiteral(-1)}, ${glslLiteral(0.5)}, ${glslLiteral(-1)})`);
  });

  it("stays within the per-draw texture-fetch budgets", () => {
    expect(fetchBudget(anchors.glsl, anchors.helpers ?? "")).toBe(1);
    const perLattice = fetchBudget(lattice.glsl, lattice.helpers ?? "");
    expect(perLattice).toBeLessThanOrEqual(385);
    expect(perLattice).toBeGreaterThan(192);
    expect(inlineFetches(stage.glsl, stage.helpers ?? "")).toBeLessThanOrEqual(20);
  });
});
