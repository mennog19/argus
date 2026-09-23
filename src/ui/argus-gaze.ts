/** How far the iris may drift from centre, in SVG user units. */
export const MAX_GAZE_SHIFT = 7;
/** Distance (px) at which the gaze reaches half of `MAX_GAZE_SHIFT`. */
export const GAZE_FALLOFF_PX = 220;

export interface GazeOffset {
  x: number;
  y: number;
}

/**
 * Where the iris should sit for a pointer `dx`/`dy` pixels away from the eye's
 * centre: the same direction, with the reach easing towards `MAX_GAZE_SHIFT`
 * so a pointer across the window doesn't look any more strained than one just
 * outside the mark.
 */
export function gazeOffset(dx: number, dy: number): GazeOffset {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return { x: 0, y: 0 };
  }
  const reach = (MAX_GAZE_SHIFT * distance) / (distance + GAZE_FALLOFF_PX);
  return { x: (dx / distance) * reach, y: (dy / distance) * reach };
}
