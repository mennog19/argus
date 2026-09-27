import { describe, expect, it } from "vitest";
import {
  BRAND_ICONS,
  brandGlyphColor,
  createBrandCatalog,
} from "../../../src/ui/entry-icons/brand-icons";

const catalog = createBrandCatalog([
  { slug: "google", title: "Google", hex: "4285F4", domains: ["google.com"], path: "M0 0" },
  { slug: "gmail", title: "Gmail", hex: "EA4335", domains: ["mail.google.com"], path: "M1 1" },
  { slug: "github", title: "GitHub", hex: "181717", domains: ["github.com"], path: "M2 2" },
]);

describe("brandGlyphColor", () => {
  it("keeps a brand colour that reads on a dark tile", () => {
    expect(brandGlyphColor("4285F4")).toBe("#4285F4");
  });

  it("swaps near-black brand colours for a light glyph", () => {
    expect(brandGlyphColor("181717")).toBe("#eceef1");
    expect(brandGlyphColor("000000")).toBe("#eceef1");
  });
});

describe("createBrandCatalog", () => {
  it("finds brands by slug", () => {
    expect(catalog.find("github")?.title).toBe("GitHub");
    expect(catalog.find("nope")).toBeUndefined();
  });

  it("computes each brand's glyph colour", () => {
    expect(catalog.find("github")?.glyphColor).toBe("#eceef1");
  });

  it("matches a host exactly, case-insensitively", () => {
    expect(catalog.matchHost("GitHub.com")?.slug).toBe("github");
  });

  it("prefers the most specific domain", () => {
    expect(catalog.matchHost("mail.google.com")?.slug).toBe("gmail");
    expect(catalog.matchHost("accounts.google.com")?.slug).toBe("google");
  });

  it("returns undefined for unknown or empty hosts", () => {
    expect(catalog.matchHost("example.com")).toBeUndefined();
    expect(catalog.matchHost("com")).toBeUndefined();
    expect(catalog.matchHost("")).toBeUndefined();
  });

  it("matches a title exactly, ignoring case and surrounding whitespace", () => {
    expect(catalog.matchTitle("GitHub")?.slug).toBe("github");
    expect(catalog.matchTitle("github")?.slug).toBe("github");
    expect(catalog.matchTitle("  GitHub  ")?.slug).toBe("github");
  });

  it("returns undefined for a title that isn't an exact brand name", () => {
    expect(catalog.matchTitle("My GitHub Account")).toBeUndefined();
    expect(catalog.matchTitle("Git Hub")).toBeUndefined();
    expect(catalog.matchTitle("")).toBeUndefined();
  });
});

describe("BRAND_ICONS", () => {
  it("ships the generated catalog", () => {
    expect(BRAND_ICONS.all.length).toBeGreaterThanOrEqual(100);
    expect(BRAND_ICONS.matchHost("github.com")?.slug).toBe("github");
    expect(BRAND_ICONS.matchTitle("american   express")?.slug).toBe("americanexpress");
  });

  it("has unique slugs and well-formed data", () => {
    const slugs = new Set(BRAND_ICONS.all.map((brand) => brand.slug));
    expect(slugs.size).toBe(BRAND_ICONS.all.length);
    for (const brand of BRAND_ICONS.all) {
      expect(brand.hex).toMatch(/^[0-9A-F]{6}$/i);
      expect(brand.path.length).toBeGreaterThan(0);
      expect(brand.domains.length).toBeGreaterThan(0);
    }
  });
});
