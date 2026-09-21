import { describe, expect, it } from "vitest";
import { EntryIcon } from "./entry-icon";

describe("EntryIcon", () => {
  it("has an automatic default", () => {
    expect(EntryIcon.AUTO.kind).toBe("auto");
    expect(EntryIcon.AUTO.key).toBe("");
    expect(EntryIcon.AUTO.toString()).toBe("auto");
  });

  it("creates library and brand icons", () => {
    expect(EntryIcon.library("star").toString()).toBe("library:star");
    expect(EntryIcon.brand("github").toString()).toBe("brand:github");
  });

  it("rejects malformed keys", () => {
    expect(() => EntryIcon.library("")).toThrow('Invalid icon key: ""');
    expect(() => EntryIcon.brand("Git Hub")).toThrow();
  });

  it("compares by kind and key", () => {
    expect(EntryIcon.library("star").equals(EntryIcon.library("star"))).toBe(true);
    expect(EntryIcon.library("star").equals(EntryIcon.brand("star"))).toBe(false);
    expect(EntryIcon.library("star").equals(EntryIcon.library("home"))).toBe(false);
  });

  it("round-trips through parse", () => {
    for (const icon of [
      EntryIcon.AUTO,
      EntryIcon.library("star"),
      EntryIcon.library("star", 235),
      EntryIcon.brand("gog.com"),
    ]) {
      expect(EntryIcon.parse(icon.toString())?.equals(icon)).toBe(true);
    }
  });

  it("returns undefined for anything it can't parse", () => {
    expect(EntryIcon.parse("")).toBeUndefined();
    expect(EntryIcon.parse("star")).toBeUndefined();
    expect(EntryIcon.parse("custom:star")).toBeUndefined();
    expect(EntryIcon.parse("library:Not Valid")).toBeUndefined();
    expect(EntryIcon.parse("library:star:")).toBeUndefined();
    expect(EntryIcon.parse("library:star:not-a-number")).toBeUndefined();
    expect(EntryIcon.parse("library:star:360")).toBeUndefined();
    expect(EntryIcon.parse("brand:github:180")).toBeUndefined();
  });

  it("supports an optional hue override on library icons", () => {
    const tinted = EntryIcon.library("star", 235);
    expect(tinted.hue).toBe(235);
    expect(tinted.toString()).toBe("library:star:235");
    expect(EntryIcon.parse("library:star:235")).toEqual(tinted);
    expect(tinted.equals(EntryIcon.library("star"))).toBe(false);
  });

  it("rejects an out-of-range or non-integer hue", () => {
    expect(() => EntryIcon.library("star", -1)).toThrow("Invalid icon hue: -1");
    expect(() => EntryIcon.library("star", 360)).toThrow("Invalid icon hue: 360");
    expect(() => EntryIcon.library("star", 1.5)).toThrow("Invalid icon hue: 1.5");
  });
});
