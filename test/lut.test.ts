// The displacement table and its three interpolations against Ansel's
// fill_lut_local_field and lut3d.c: the level-16 table of parameter set A,
// and the tetrahedral / trilinear / pyramid lookups over inputs inside and
// outside the unit cube (the clamp-and-residual extension).

import { describe, expect, it } from "vitest";
import { INTERPOLATIONS, applyDisplacementTable, fillDisplacementTable, lutIndex } from "../src/field";
import { allAnchors } from "../src/rings";
import { fieldParamsOf } from "./field.test";
import { curvesFromReference } from "./support/reference-params";
import { V, closeTo } from "./support/vectors";

const LEVEL = 16;

function tableA(): Float32Array {
  return fillDisplacementTable(LEVEL, allAnchors(curvesFromReference(V.params[0])), fieldParamsOf(V.params[0]));
}

describe("fillDisplacementTable", () => {
  it("stores Ansel's table as displacements from the lattice", () => {
    const table = tableA();
    expect(table.length).toBe(LEVEL * LEVEL * LEVEL * 3);
    for (let b = 0; b < LEVEL; b++) {
      for (let g = 0; g < LEVEL; g++) {
        for (let r = 0; r < LEVEL; r++) {
          const i = lutIndex(r, g, b, LEVEL) * 3;
          const x = [r, g, b].map((v) => v / (LEVEL - 1));
          const absolute = [table[i] + x[0], table[i + 1] + x[1], table[i + 2] + x[2]];
          expect(closeTo(absolute, V.lut16.slice(i, i + 3), 3e-5)).toBe(true);
        }
      }
    }
  });
});

describe("applyDisplacementTable", () => {
  it("names the three interpolations in Ansel's order", () => {
    expect(INTERPOLATIONS).toEqual(["tetrahedral", "trilinear", "pyramid"]);
  });

  it("matches lut3d.c for every interpolation, inside and outside the cube", () => {
    const table = tableA();
    const modes = [V.apply.tetrahedral, V.apply.trilinear, V.apply.pyramid];
    V.apply.inputs.forEach((input, i) => {
      modes.forEach((expected, mode) => {
        expect(closeTo(applyDisplacementTable(input, table, LEVEL, mode as 0 | 1 | 2), expected[i], 3e-5)).toBe(true);
      });
    });
  });

  it("is exactly the identity on an all-zero table", () => {
    const zero = new Float32Array(LEVEL * LEVEL * LEVEL * 3);
    for (const v of [[0.2, 0.5, 0.9], [1.3, -0.2, 0.5], [0, 0, 0], [1, 1, 1]] as const) {
      for (const mode of [0, 1, 2] as const) expect(applyDisplacementTable(v, zero, LEVEL, mode)).toEqual([...v]);
    }
  });
});
