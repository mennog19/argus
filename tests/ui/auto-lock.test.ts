import { describe, expect, it } from "vitest";
import { hasClockJumped, hasIdleTimedOut } from "../../src/ui/auto-lock";

describe("hasIdleTimedOut", () => {
  it("is false before the timeout has elapsed", () => {
    expect(hasIdleTimedOut(0, 4 * 60_000, 5)).toBe(false);
  });

  it("is true once the timeout has elapsed", () => {
    expect(hasIdleTimedOut(0, 5 * 60_000, 5)).toBe(true);
  });

  it("is true well past the timeout", () => {
    expect(hasIdleTimedOut(0, 10 * 60_000, 5)).toBe(true);
  });
});

describe("hasClockJumped", () => {
  it("is false when the gap matches the expected interval", () => {
    expect(hasClockJumped(0, 15_000, 15_000, 10_000)).toBe(false);
  });

  it("is false for a small overrun within tolerance", () => {
    expect(hasClockJumped(0, 20_000, 15_000, 10_000)).toBe(false);
  });

  it("is true for a gap far larger than the interval plus tolerance", () => {
    expect(hasClockJumped(0, 120_000, 15_000, 10_000)).toBe(true);
  });
});
