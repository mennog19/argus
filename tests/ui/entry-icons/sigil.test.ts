import { describe, expect, it } from "vitest";
import { hashString, hostOf, sigilFor, sigilSeed } from "../../../src/ui/entry-icons/sigil";

describe("hashString", () => {
  it("is deterministic and unsigned", () => {
    expect(hashString("github.com")).toBe(hashString("github.com"));
    expect(hashString("github.com")).toBeGreaterThanOrEqual(0);
  });

  it("returns the FNV-1a offset basis for the empty string", () => {
    expect(hashString("")).toBe(0x811c9dc5);
  });

  it("differs for different inputs", () => {
    expect(hashString("github.com")).not.toBe(hashString("gitlab.com"));
  });
});

describe("sigilSeed", () => {
  it("uses the URL host, without a leading www.", () => {
    expect(sigilSeed("Work GitHub", "https://www.github.com/login")).toBe("github.com");
  });

  it("accepts a bare host without a scheme", () => {
    expect(sigilSeed("Notion", "notion.so/workspace")).toBe("notion.so");
  });

  it("falls back to the lowercased title when there is no URL", () => {
    expect(sigilSeed("  Bank Card ", "   ")).toBe("bank card");
  });

  it("falls back to the title when the URL can't be parsed", () => {
    expect(sigilSeed("Wifi", "not a url")).toBe("wifi");
  });
});

describe("sigilFor", () => {
  it("gives the same sigil for the same seed", () => {
    expect(sigilFor("github.com")).toEqual(sigilFor("github.com"));
  });

  it("keeps every parameter inside its designed range", () => {
    for (const seed of ["", "a", "github.com", "notion.so", "bank card", "x".repeat(40)]) {
      const sigil = sigilFor(seed);
      expect([25, 55, 85, 145, 175, 205, 235, 265, 300, 335]).toContain(sigil.hue);
      expect([3, 4, 5, 6, 8]).toContain(sigil.segments);
      expect(sigil.segmentFill).toBeGreaterThanOrEqual(0.5);
      expect(sigil.segmentFill).toBeLessThanOrEqual(0.85 + 1e-9);
      expect(sigil.outerRotation).toBeGreaterThanOrEqual(0);
      expect(sigil.outerRotation).toBeLessThan(360);
      expect(sigil.innerSweep).toBeGreaterThanOrEqual(0.35);
      expect(sigil.innerSweep).toBeLessThanOrEqual(0.84 + 1e-9);
      expect(sigil.innerRotation).toBeGreaterThanOrEqual(0);
      expect(sigil.innerRotation).toBeLessThan(360);
      expect(sigil.pupilRadius).toBeGreaterThanOrEqual(2);
      expect(sigil.pupilRadius).toBeLessThanOrEqual(3.2 + 1e-9);
    }
  });

  it("spreads different sites across different sigils", () => {
    const seeds = [
      "github.com",
      "gitlab.com",
      "notion.so",
      "google.com",
      "amazon.com",
      "bank card",
    ];
    const distinct = new Set(seeds.map((seed) => JSON.stringify(sigilFor(seed))));
    expect(distinct.size).toBe(seeds.length);
  });
});

describe("hostOf", () => {
  it("extracts the host without www.", () => {
    expect(hostOf(" https://www.Example.com/path ")).toBe("example.com");
  });

  it("returns undefined for empty or unparseable URLs", () => {
    expect(hostOf("  ")).toBeUndefined();
    expect(hostOf("not a url")).toBeUndefined();
  });
});
