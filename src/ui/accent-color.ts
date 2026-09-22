import { AccentColor, AccentColorPresetId } from "../application/settings";

interface AccentColorPreset {
  readonly id: AccentColorPresetId;
  readonly label: string;
  readonly hue: number;
}

/** The 6 built-in accent presets, spread around the OKLCH hue wheel. */
export const ACCENT_COLOR_PRESETS: readonly AccentColorPreset[] = [
  { id: "blue", label: "Blue", hue: 262 },
  { id: "purple", label: "Purple", hue: 295 },
  { id: "pink", label: "Pink", hue: 340 },
  { id: "orange", label: "Orange", hue: 45 },
  { id: "green", label: "Green", hue: 145 },
  { id: "teal", label: "Teal", hue: 195 },
];

/** The OKLCH hue backing `accentColor`, resolving a preset id to its hue. */
export function accentColorHue(accentColor: AccentColor): number {
  if (accentColor.kind === "custom") {
    return accentColor.hue;
  }
  const preset = ACCENT_COLOR_PRESETS.find((candidate) => candidate.id === accentColor.id);
  return (preset ?? ACCENT_COLOR_PRESETS[0]).hue;
}

/**
 * The `--color-accent`/`--color-accent-hover` CSS values for `hue`, matching
 * the lightness/chroma of the original hardcoded blue theme so every accent
 * color reads at the same visual weight.
 */
export function accentColorCssVars(hue: number): { accent: string; accentHover: string } {
  return {
    accent: `oklch(65.5% 0.156 ${hue})`,
    accentHover: `oklch(72.3% 0.122 ${hue})`,
  };
}
