import { CSSProperties } from "react";

/** Where a floating panel's trigger button sat, in viewport coordinates, when it was opened. */
export interface Anchor {
  top: number;
  left: number;
  bottom: number;
}

const FLOATING_GUTTER = 12;
export const ROW_MENU_WIDTH = 176;
export const ICON_POPOVER_WIDTH = 340;

export function anchorOf(trigger: Element): Anchor {
  const { top, left, bottom } = trigger.getBoundingClientRect();
  return { top, left, bottom };
}

/** Places a `width`-wide panel just under its anchor, kept inside the viewport's side gutters. */
export function floatingStyle(anchor: Anchor, width: number): CSSProperties {
  const maxLeft = window.innerWidth - width - FLOATING_GUTTER;
  return {
    left: Math.max(FLOATING_GUTTER, Math.min(anchor.left, maxLeft)),
    top: anchor.bottom + 6,
  };
}
