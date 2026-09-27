import { describe, expect, it } from "vitest";
import { GAZE_FALLOFF_PX, MAX_GAZE_SHIFT, gazeOffset } from "../../src/ui/argus-gaze";

describe("gazeOffset", () => {
  it("stays centred when the pointer is on the eye", () => {
    expect(gazeOffset(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("reaches half its travel at the falloff distance", () => {
    expect(gazeOffset(GAZE_FALLOFF_PX, 0)).toEqual({ x: MAX_GAZE_SHIFT / 2, y: 0 });
  });

  it("leans towards the pointer without passing the limit", () => {
    const { x, y } = gazeOffset(-3000, 4000);
    expect(Math.hypot(x, y)).toBeLessThan(MAX_GAZE_SHIFT);
    expect(Math.hypot(x, y)).toBeGreaterThan(MAX_GAZE_SHIFT * 0.9);
    // Same direction as the pointer: left and down.
    expect(x / y).toBeCloseTo(-3 / 4);
  });

  it("scales with how close the pointer is", () => {
    const near = gazeOffset(60, 0);
    const far = gazeOffset(600, 0);
    expect(far.x).toBeGreaterThan(near.x);
  });
});
