import { describe, expect, it } from "vitest";
import { Icon } from "../../domain";
import { LIBRARY_ICON_KEEPASS_IDS } from "../../infrastructure/kdbx-icon";
import { findLibraryIcon, LIBRARY_ICONS } from "./library-icons";

describe("LIBRARY_ICONS", () => {
  it("has unique keys that are valid icon keys", () => {
    const keys = LIBRARY_ICONS.map((icon) => icon.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(() => Icon.library(key)).not.toThrow();
    }
  });

  it("matches the KeePass icon mapping key for key", () => {
    expect(LIBRARY_ICONS.map((icon) => icon.key).sort()).toEqual(
      Object.keys(LIBRARY_ICON_KEEPASS_IDS).sort(),
    );
  });
});

describe("findLibraryIcon", () => {
  it("looks icons up by key", () => {
    expect(findLibraryIcon("luggage")?.label).toBe("Luggage");
    expect(findLibraryIcon("nope")).toBeUndefined();
  });
});
