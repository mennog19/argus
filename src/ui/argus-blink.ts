/** How long the eye stays shut per blink. */
export const BLINK_DURATION_MS = 140;
/** Pause between the two blinks of an occasional double blink. */
export const DOUBLE_BLINK_GAP_MS = 180;
/** Chance that a blink is a double blink. */
export const DOUBLE_BLINK_CHANCE = 0.2;

/** Delay until the next blink: somewhere between 2.5 and 8 seconds. */
export function nextBlinkDelay(random: number): number {
  return 2500 + random * 5500;
}
