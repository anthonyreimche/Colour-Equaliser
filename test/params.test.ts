// The bag bridge: the raw nodes are both the edit and the GPU data, chunked
// into vec4 uniforms; what a foreign or partial bag reads as; the derived
// `on` gate; and re-derivation when a loaded bag's gate disagrees with its
// curves.

import { describe, expect, it } from "vitest";
import { CHANNELS } from "../src/curve";
import { DEFAULT_PARAMS, defaultCurves, type Params } from "../src/model";
import {
  CHUNKS,
  EXT_ID,
  KEY,
  STAGE_ID,
  type Bag,
  countKey,
  curveKey,
  curveKeys,
  deriveAll,
  packCurve,
  readParams,
  rederivePatch,
  resetPatch,
  stagePrefix4,
  unpackCurve,
} from "../src/params";
import { RINGS } from "../src/rings";
import { paramsFromReference } from "./support/reference-params";
import { V } from "./support/vectors";

const sets = () => V.params.map(paramsFromReference);

describe("keys", () => {
  it("qualify every key under the salted stage id", () => {
    expect(EXT_ID).toBe("colour-equaliser");
    expect(STAGE_ID.startsWith("colour-equaliser.rings")).toBe(true);
    expect(curveKey("shadows", "hue", 3)).toBe(`${STAGE_ID}.shadowsHue3`);
    expect(countKey("highlights", "saturation")).toBe(`${STAGE_ID}.highlightsSaturationCount`);
    expect(KEY.whiteLevel).toBe(`${STAGE_ID}.whiteLevel`);
    expect(curveKeys().length).toBe(9 * (CHUNKS + 1));
    expect(CHUNKS).toBe(10);
  });

  it("mirrors the host's 4-char stage prefix", () => {
    // ((h << 5) − h + code) | 0 over the id, unsigned, base 36, four chars.
    const id = "colour-equaliser.rings";
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    expect(stagePrefix4(id)).toBe((h >>> 0).toString(36).slice(0, 4));
    expect(stagePrefix4(id)).toMatch(/^[0-9a-z]{4}$/);
  });
});

describe("chunk packing", () => {
  it("packs nodes two per vec4, zero padded, and unpacks them normalised", () => {
    const packed = packCurve([{ x: 0.5, y: 0.2 }, { x: 0.1, y: 0.7 }, { x: 0.9, y: 0.4 }]);
    expect(packed.count).toBe(3);
    expect(packed.chunks.length).toBe(CHUNKS);
    expect(packed.chunks[0]).toEqual([0.1, 0.7, 0.5, 0.2]);
    expect(packed.chunks[1]).toEqual([0.9, 0.4, 0, 0]);
    expect(packed.chunks[9]).toEqual([0, 0, 0, 0]);
    expect(unpackCurve(packed.chunks, packed.count)).toEqual([{ x: 0.1, y: 0.7 }, { x: 0.5, y: 0.2 }, { x: 0.9, y: 0.4 }]);
  });
});

describe("readParams", () => {
  it("reads Ansel's defaults from an empty bag", () => {
    expect(readParams({})).toEqual(DEFAULT_PARAMS);
  });

  it("round-trips every reference parameter set through deriveAll", () => {
    for (const p of sets()) {
      const back = readParams(deriveAll(p));
      expect(back.whiteLevel).toBe(p.whiteLevel);
      expect(back.interpolation).toBe(p.interpolation);
      for (const ring of RINGS) {
        for (const channel of CHANNELS) {
          const a = back.curves[ring][channel];
          const b = p.curves[ring][channel];
          expect(a.length).toBe(b.length);
          a.forEach((n, k) => {
            expect(n.x).toBeCloseTo(b[k].x, 12);
            expect(n.y).toBeCloseTo(b[k].y, 12);
          });
        }
      }
    }
  });

  it("falls back per curve on foreign values and per scalar on bad numbers", () => {
    const bag: Bag = { ...deriveAll(sets()[1]) };
    bag[curveKey("highlights", "hue", 0)] = ["x", 0.5, 0.2, 0.5];
    bag[countKey("shadows", "brightness")] = 1;
    bag[countKey("midtones", "saturation")] = 30;
    bag[KEY.sigmaL] = "loud";
    bag[KEY.interpolation] = 7.6;
    bag[KEY.whiteLevel] = Number.NaN;
    const p = readParams(bag);
    expect(p.curves.highlights.hue).toEqual(defaultCurves().highlights.hue);
    expect(p.curves.shadows.brightness).toEqual(defaultCurves().shadows.brightness);
    expect(p.curves.midtones.saturation).toEqual(defaultCurves().midtones.saturation);
    expect(p.sigmaL).toBe(DEFAULT_PARAMS.sigmaL);
    expect(p.interpolation).toBe(2);
    expect(p.whiteLevel).toBe(DEFAULT_PARAMS.whiteLevel);
    expect(p.sigmaRho).toBeCloseTo(0.6, 6);
  });

  it("wraps and sorts nodes and drops duplicates", () => {
    const bag = deriveAll(DEFAULT_PARAMS);
    bag[curveKey("shadows", "hue", 0)] = [1.2, 0.3, 0.5, 0.6];
    bag[curveKey("shadows", "hue", 1)] = [0.2, 0.9, 0, 0];
    bag[countKey("shadows", "hue")] = 3;
    const nodes = readParams(bag).curves.shadows.hue;
    expect(nodes.length).toBe(2);
    expect(nodes[0].x).toBeCloseTo(0.2, 12);
    expect(nodes[1]).toEqual({ x: 0.5, y: 0.6 });
  });
});

describe("deriveAll", () => {
  it("writes every curve chunk, count and scalar, and the gate", () => {
    const patch = deriveAll(DEFAULT_PARAMS);
    expect(Object.keys(patch).length).toBe(9 * (CHUNKS + 1) + 7);
    expect(patch[curveKey("shadows", "hue", 0)]).toEqual([0, 0.5, 0.125, 0.5]);
    expect(patch[countKey("shadows", "hue")]).toBe(8);
    expect(patch[KEY.on]).toBe(0);
    expect(patch[KEY.sigmaTheta]).toBe(0.4);
    expect(deriveAll(sets()[0])[KEY.on]).toBe(1);
    for (const v of Object.values(patch)) expect(Array.isArray(v) ? v.length === 4 : typeof v === "number").toBe(true);
  });

  it("resets to the defaults", () => {
    expect(resetPatch()).toEqual(deriveAll(DEFAULT_PARAMS));
  });
});

describe("rederivePatch", () => {
  it("leaves a bag without the equaliser or a consistent one alone", () => {
    expect(rederivePatch({})).toBeNull();
    expect(rederivePatch({ "other.stage.amount": 3 })).toBeNull();
    expect(rederivePatch(deriveAll(sets()[0]))).toBeNull();
  });

  it("re-derives the gate when it disagrees with the curves", () => {
    const p: Params = sets()[0];
    expect(rederivePatch({ ...deriveAll(p), [KEY.on]: 0 })).toEqual(deriveAll(p));
    const partial = { [curveKey("midtones", "saturation", 0)]: [0, 0.5, 0.125, 0.9], [countKey("midtones", "saturation")]: 2 };
    expect(rederivePatch(partial)?.[KEY.on]).toBe(1);
  });
});
