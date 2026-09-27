import { describe, expect, it } from "vitest";
import { Icon } from "../../src/domain/icon";

describe("Icon", () => {
  it("has an automatic default", () => {
    expect(Icon.AUTO.kind).toBe("auto");
    expect(Icon.AUTO.key).toBe("");
    expect(Icon.AUTO.toString()).toBe("auto");
  });

  it("creates library and brand icons", () => {
    expect(Icon.library("star").toString()).toBe("library:star");
    expect(Icon.brand("github").toString()).toBe("brand:github");
  });

  it("rejects malformed keys", () => {
    expect(() => Icon.library("")).toThrow('Invalid icon key: ""');
    expect(() => Icon.brand("Git Hub")).toThrow();
  });

  it("compares by kind and key", () => {
    expect(Icon.library("star").equals(Icon.library("star"))).toBe(true);
    expect(Icon.library("star").equals(Icon.brand("star"))).toBe(false);
    expect(Icon.library("star").equals(Icon.library("home"))).toBe(false);
  });

  it("round-trips through parse", () => {
    for (const icon of [
      Icon.AUTO,
      Icon.library("star"),
      Icon.library("star", 235),
      Icon.brand("gog.com"),
    ]) {
      expect(Icon.parse(icon.toString())?.equals(icon)).toBe(true);
    }
  });

  it("returns undefined for anything it can't parse", () => {
    expect(Icon.parse("")).toBeUndefined();
    expect(Icon.parse("star")).toBeUndefined();
    expect(Icon.parse("custom:star")).toBeUndefined();
    expect(Icon.parse("library:Not Valid")).toBeUndefined();
    expect(Icon.parse("library:star:")).toBeUndefined();
    expect(Icon.parse("library:star:not-a-number")).toBeUndefined();
    expect(Icon.parse("library:star:360")).toBeUndefined();
    expect(Icon.parse("brand:github:180")).toBeUndefined();
  });

  it("supports an optional hue override on library icons", () => {
    const tinted = Icon.library("star", 235);
    expect(tinted.hue).toBe(235);
    expect(tinted.toString()).toBe("library:star:235");
    expect(Icon.parse("library:star:235")).toEqual(tinted);
    expect(tinted.equals(Icon.library("star"))).toBe(false);
  });

  it("rejects an out-of-range or non-integer hue", () => {
    expect(() => Icon.library("star", -1)).toThrow("Invalid icon hue: -1");
    expect(() => Icon.library("star", 360)).toThrow("Invalid icon hue: 360");
    expect(() => Icon.library("star", 1.5)).toThrow("Invalid icon hue: 1.5");
  });
});
