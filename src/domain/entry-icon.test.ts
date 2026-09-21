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
    for (const icon of [EntryIcon.AUTO, EntryIcon.library("star"), EntryIcon.brand("gog.com")]) {
      expect(EntryIcon.parse(icon.toString())?.equals(icon)).toBe(true);
    }
  });

  it("returns undefined for anything it can't parse", () => {
    expect(EntryIcon.parse("")).toBeUndefined();
    expect(EntryIcon.parse("star")).toBeUndefined();
    expect(EntryIcon.parse("custom:star")).toBeUndefined();
    expect(EntryIcon.parse("library:Not Valid")).toBeUndefined();
  });
});
