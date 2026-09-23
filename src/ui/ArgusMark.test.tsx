import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { ArgusMark } from "./ArgusMark";
import { GAZE_FALLOFF_PX, MAX_GAZE_SHIFT, gazeOffset } from "./argus-gaze";
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

describe("ArgusMark gaze", () => {
  it("starts looking straight ahead", () => {
    const { container } = render(<ArgusMark />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--argus-gaze-x")).toBe("0px");
    expect(root.style.getPropertyValue("--argus-gaze-y")).toBe("0px");
  });

  it("follows the pointer moving anywhere in the window", () => {
    const { container } = render(<ArgusMark />);
    const root = container.firstElementChild as HTMLElement;
    // jsdom reports a zero-sized box, so the mark's centre is the origin.
    fireEvent.pointerMove(window, { clientX: GAZE_FALLOFF_PX, clientY: 0 });

    expect(root.style.getPropertyValue("--argus-gaze-x")).toBe(`${MAX_GAZE_SHIFT / 2}px`);
    expect(root.style.getPropertyValue("--argus-gaze-y")).toBe("0px");

    fireEvent.pointerMove(window, { clientX: -120, clientY: 90 });
    const expected = gazeOffset(-120, 90);
    expect(root.style.getPropertyValue("--argus-gaze-x")).toBe(`${expected.x}px`);
    expect(root.style.getPropertyValue("--argus-gaze-y")).toBe(`${expected.y}px`);
  });

  it("stops following once unmounted", () => {
    const { container, unmount } = render(<ArgusMark />);
    const root = container.firstElementChild as HTMLElement;
    unmount();
    fireEvent.pointerMove(window, { clientX: 400, clientY: 400 });
    expect(root.style.getPropertyValue("--argus-gaze-x")).toBe("0px");
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
