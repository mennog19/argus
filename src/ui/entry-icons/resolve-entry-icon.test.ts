import { describe, expect, it } from "vitest";
import { EntryIcon } from "../../domain";
import { createBrandCatalog } from "./brand-icons";
import { resolveEntryIcon } from "./resolve-entry-icon";

const brands = createBrandCatalog([
  { slug: "github", title: "GitHub", hex: "181717", domains: ["github.com"], path: "M0 0" },
  { slug: "notion", title: "Notion", hex: "000000", domains: ["notion.so"], path: "M1 1" },
]);

function resolve(url: string, icon: EntryIcon, title = "Title") {
  return resolveEntryIcon({ title, url, icon }, brands);
}

describe("resolveEntryIcon", () => {
  it("shows a known site's logo automatically", () => {
    const resolved = resolve("https://www.github.com/login", EntryIcon.AUTO);
    expect(resolved.kind === "brand" && resolved.icon.slug).toBe("github");
  });

  it("falls back to the sigil for unknown sites", () => {
    expect(resolve("https://example.com", EntryIcon.AUTO)).toEqual({
      kind: "sigil",
      seed: "example.com",
    });
    expect(resolve("", EntryIcon.AUTO, "Bank Card")).toEqual({ kind: "sigil", seed: "bank card" });
  });

  it("honours an explicitly chosen library icon, keeping the site's seed for its colour", () => {
    const resolved = resolve("https://github.com", EntryIcon.library("star"));
    expect(resolved.kind).toBe("library");
    expect(resolved.kind === "library" && resolved.icon.key).toBe("star");
    expect(resolved.kind === "library" && resolved.seed).toBe("github.com");
  });

  it("honours an explicitly chosen brand, whatever the URL", () => {
    const resolved = resolve("https://example.com", EntryIcon.brand("notion"));
    expect(resolved.kind === "brand" && resolved.icon.slug).toBe("notion");
  });

  it("treats unknown chosen keys as automatic", () => {
    const fromLibrary = resolve("https://github.com", EntryIcon.library("from-the-future"));
    expect(fromLibrary.kind === "brand" && fromLibrary.icon.slug).toBe("github");
    expect(resolve("https://example.com", EntryIcon.brand("gone")).kind).toBe("sigil");
  });

  it("uses the bundled catalog by default", () => {
    const resolved = resolveEntryIcon({
      title: "",
      url: "https://github.com",
      icon: EntryIcon.AUTO,
    });
    expect(resolved.kind).toBe("brand");
  });
});
