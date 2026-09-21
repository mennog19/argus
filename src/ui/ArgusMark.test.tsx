import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { ArgusMark } from "./ArgusMark";
import {
  BLINK_DURATION_MS,
  DOUBLE_BLINK_CHANCE,
  DOUBLE_BLINK_GAP_MS,
  nextBlinkDelay,
} from "./argus-blink";

/** Returns the given values in order, repeating the last one forever. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function isBlinking(container: HTMLElement): boolean {
  return container.firstElementChild!.hasAttribute("data-blinking");
}

describe("ArgusMark", () => {
  it("watches by default", () => {
    const { container } = render(<ArgusMark />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("data-state", "watching");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".argus-mark-ticks line")).toHaveLength(36);
  });

  it("draws every third tick longer", () => {
    const { container } = render(<ArgusMark />);
    const ticks = container.querySelectorAll(".argus-mark-ticks line");
    expect(ticks[0]).toHaveAttribute("y2", "10");
    expect(ticks[1]).toHaveAttribute("y2", "7.5");
  });

  it("reflects the focusing state", () => {
    const { container } = render(<ArgusMark state="focusing" />);
    expect(container.firstElementChild).toHaveAttribute("data-state", "focusing");
  });
});

describe("nextBlinkDelay", () => {
  it("spans 2.5 to 8 seconds", () => {
    expect(nextBlinkDelay(0)).toBe(2500);
    expect(nextBlinkDelay(1)).toBe(8000);
  });
});

describe("ArgusMark blinking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blinks once after a random delay, then waits again", () => {
    // delay → 2500ms, single blink, next delay → 2500ms
    const { container } = render(<ArgusMark random={sequence(0, 0.9, 0)} />);
    expect(isBlinking(container)).toBe(false);

    act(() => vi.advanceTimersByTime(2499));
    expect(isBlinking(container)).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(isBlinking(container)).toBe(true);

    act(() => vi.advanceTimersByTime(BLINK_DURATION_MS));
    expect(isBlinking(container)).toBe(false);

    act(() => vi.advanceTimersByTime(2500));
    expect(isBlinking(container)).toBe(true);
  });

  it("sometimes blinks twice in quick succession", () => {
    const { container } = render(
      <ArgusMark random={sequence(0, DOUBLE_BLINK_CHANCE / 2, 1, 0.9)} />,
    );

    act(() => vi.advanceTimersByTime(2500));
    expect(isBlinking(container)).toBe(true);
    act(() => vi.advanceTimersByTime(BLINK_DURATION_MS));
    expect(isBlinking(container)).toBe(false);

    act(() => vi.advanceTimersByTime(DOUBLE_BLINK_GAP_MS));
    expect(isBlinking(container)).toBe(true);
    act(() => vi.advanceTimersByTime(BLINK_DURATION_MS));
    expect(isBlinking(container)).toBe(false);

    // Back to the normal rhythm: the next delay drew 1 → 8 seconds.
    act(() => vi.advanceTimersByTime(7999));
    expect(isBlinking(container)).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(isBlinking(container)).toBe(true);
  });

  it("stops blinking when unmounted", () => {
    const random = vi.fn(() => 0.9);
    const { unmount } = render(<ArgusMark random={random} />);
    unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(random).toHaveBeenCalledTimes(1);
  });
});
