import { describe, expect, it } from "vitest";
import { Tag } from "../../src/domain/tag";
import { Tags } from "../../src/domain/tags";

describe("Tags", () => {
  it("starts empty by default", () => {
    expect(new Tags().values).toEqual([]);
  });

  it("de-duplicates equal tags on construction", () => {
    const tags = new Tags([new Tag("work"), new Tag("work"), new Tag("home")]);

    expect(tags.values.map((t) => t.toString())).toEqual(["work", "home"]);
  });

  it("reports whether a tag is present", () => {
    const tags = new Tags([new Tag("work")]);

    expect(tags.has(new Tag("work"))).toBe(true);
    expect(tags.has(new Tag("home"))).toBe(false);
  });

  it("adds a new tag without mutating the original", () => {
    const original = new Tags([new Tag("work")]);
    const updated = original.add(new Tag("home"));

    expect(original.values.map((t) => t.toString())).toEqual(["work"]);
    expect(updated.values.map((t) => t.toString())).toEqual(["work", "home"]);
  });

  it("adding an already-present tag returns the same instance", () => {
    const original = new Tags([new Tag("work")]);

    expect(original.add(new Tag("work"))).toBe(original);
  });

  it("removes a tag without mutating the original", () => {
    const original = new Tags([new Tag("work"), new Tag("home")]);
    const updated = original.remove(new Tag("work"));

    expect(original.values.map((t) => t.toString())).toEqual(["work", "home"]);
    expect(updated.values.map((t) => t.toString())).toEqual(["home"]);
  });
});
