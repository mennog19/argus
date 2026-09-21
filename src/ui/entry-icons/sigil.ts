/**
 * Deterministic "eye" sigils for entries — one of Argus's hundred eyes per
 * site. Everything is derived from a hash of the entry's host (or title), so
 * the same site always gets the same sigil and nothing is ever fetched.
 */

export interface Sigil {
  /** OKLCH hue in degrees, picked from a fixed muted palette. */
  hue: number;
  /** Number of dashes in the outer ring. */
  segments: number;
  /** Fraction (0–1) of each outer segment that is drawn rather than gap. */
  segmentFill: number;
  /** Rotation of the outer ring in degrees. */
  outerRotation: number;
  /** Fraction (0–1) of the inner ring's circumference that is drawn. */
  innerSweep: number;
  /** Rotation of the inner arc in degrees. */
  innerRotation: number;
  /** Pupil radius in the 32×32 sigil viewBox. */
  pupilRadius: number;
}

/** The fixed muted palette sigils (and manual hue overrides) are drawn from. */
export const HUES = [25, 55, 85, 145, 175, 205, 235, 265, 300, 335];
const SEGMENT_COUNTS = [3, 4, 5, 6, 8];

/** FNV-1a, 32-bit. Stable across runs and platforms. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The URL's host without a leading `www.`, accepting bare hosts; `undefined` if there isn't one. */
export function hostOf(url: string): string | undefined {
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return undefined;
  }
  try {
    const host = new URL(trimmedUrl.includes("://") ? trimmedUrl : `https://${trimmedUrl}`)
      .hostname;
    return host.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** The string a sigil is derived from: the URL's host when there is one, else the title. */
export function sigilSeed(title: string, url: string): string {
  return hostOf(url) ?? title.trim().toLowerCase();
}

export function sigilFor(seed: string): Sigil {
  const hash = hashString(seed);
  // Pull independent-ish parameters out of different bit ranges of the hash.
  const bits = (shift: number, width: number) => (hash >>> shift) & ((1 << width) - 1);
  return {
    hue: HUES[bits(0, 8) % HUES.length],
    segments: SEGMENT_COUNTS[bits(8, 4) % SEGMENT_COUNTS.length],
    segmentFill: 0.5 + bits(12, 3) * 0.05,
    outerRotation: bits(15, 5) * (360 / 32),
    innerSweep: 0.35 + bits(20, 3) * 0.07,
    innerRotation: bits(23, 5) * (360 / 32),
    pupilRadius: 2 + bits(28, 2) * 0.4,
  };
}
