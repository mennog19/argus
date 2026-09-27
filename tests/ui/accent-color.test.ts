import { describe, expect, it } from "vitest";
import { AccentColor } from "../../src/application/settings";
import { accentColorCssVars, accentColorHue } from "../../src/ui/accent-color";

describe("accentColorHue", () => {
  it("resolves a preset id to its hue", () => {
    const accentColor: AccentColor = { kind: "preset", id: "teal" };

    expect(accentColorHue(accentColor)).toBe(195);
  });

  it("falls back to the first preset for an unrecognized id", () => {
    const accentColor = { kind: "preset", id: "not-a-real-preset" } as unknown as AccentColor;

    expect(accentColorHue(accentColor)).toBe(262);
  });

  it("returns a custom hue as-is", () => {
    const accentColor: AccentColor = { kind: "custom", hue: 88 };

    expect(accentColorHue(accentColor)).toBe(88);
  });
});

describe("accentColorCssVars", () => {
  it("builds accent and accent-hover OKLCH values for a hue", () => {
    expect(accentColorCssVars(200)).toEqual({
      accent: "oklch(65.5% 0.156 200)",
      accentHover: "oklch(72.3% 0.122 200)",
    });
  });
});
