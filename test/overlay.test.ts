// The overlay's frame-point to UV mapping, and the colours it reads under the
// pointer from samples of the view.

import { describe, expect, it } from "vitest";
import { pointToUv, readAt } from "../src/Overlay";
import type { FrameSample, Samples } from "../src/store";

describe("pointToUv", () => {
  const rect = { x: 50, y: 10, w: 100, h: 80 };

  it("maps a frame point through the image rect", () => {
    expect(pointToUv({ x: 100, y: 40 }, rect)).toEqual({ x: 0.5, y: 0.375 });
  });

  it("is null outside the image or without a rect", () => {
    expect(pointToUv({ x: 5, y: 40 }, rect)).toBeNull();
    expect(pointToUv({ x: 100, y: 40 }, null)).toBeNull();
  });
});

describe("readAt", () => {
  // A 40×20 frame of the view: red on its left half, blue on its right.
  const frame = (): FrameSample => {
    const width = 40;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) data.set(x < width / 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * width + x) * 4);
    return { data, width, height };
  };
  // Zoomed in: the view's frame fills a 400×200 box at (100, 50), while the
  // whole photo's box reaches far past it.
  const samples = (): Samples => ({ input: frame(), output: frame(), view: { x: 100, y: 50, w: 400, h: 200 } });

  it("reads the frame through the view it was captured in, at its own pixels", () => {
    const left = readAt(samples(), { x: 140, y: 150 });
    const right = readAt(samples(), { x: 460, y: 150 });
    expect(left?.inputRgb).toEqual([1, 0, 0]);
    expect(left?.outputRgb).toEqual([1, 0, 0]);
    expect(right?.inputRgb).toEqual([0, 0, 1]);
    expect(left?.hue).not.toBeCloseTo(right?.hue ?? 0, 1);
  });

  it("is null outside the view or without samples of it", () => {
    expect(readAt(samples(), { x: 90, y: 150 })).toBeNull();
    expect(readAt({ ...samples(), view: null }, { x: 140, y: 150 })).toBeNull();
    expect(readAt({ input: null, output: null, view: null }, { x: 140, y: 150 })).toBeNull();
  });
});
