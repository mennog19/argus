import { describe, expect, it } from "vitest";
import { Icon } from "../../src/domain/icon";

describe("Icon", () => {
  it("has an automatic default", () => {
    expect(Icon.AUTO.kind).toBe("auto");
    expect(Icon.AUTO.key).toBe("");
    expect(Icon.AUTO.toString()).toBe("auto");
  });

  it("has a choice for the generated sigil, apart from automatic", () => {
    expect(Icon.SIGIL.kind).toBe("sigil");
    expect(Icon.SIGIL.toString()).toBe("sigil");
    expect(Icon.parse("sigil")).toBe(Icon.SIGIL);
    expect(Icon.SIGIL.equals(Icon.AUTO)).toBe(false);
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

  describe("custom", () => {
    const id = "0a1b2c3d-0000-4000-8000-00000000abcd";

    it("points at a vault image icon by its id", () => {
      const icon = Icon.custom(id);
      expect(icon.kind).toBe("custom");
      expect(icon.key).toBe(id);
      expect(icon.toString()).toBe(`custom:${id}`);
    });

    it("round-trips through parse", () => {
      expect(Icon.parse(`custom:${id}`)?.equals(Icon.custom(id))).toBe(true);
    });

    it("rejects anything but a lowercase UUID", () => {
      expect(() => Icon.custom("star")).toThrow('Invalid custom icon id: "star"');
      expect(() => Icon.custom(id.toUpperCase())).toThrow("Invalid custom icon id");
      expect(Icon.parse(`custom:${id}:12`)).toBeUndefined();
    });
  });
});
