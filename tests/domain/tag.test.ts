import { describe, expect, it } from "vitest";
import { Tag } from "./tag";

describe("Tag", () => {
  it("stores a trimmed value", () => {
    expect(new Tag("  work  ").toString()).toBe("work");
  });

  it("rejects an empty tag", () => {
    expect(() => new Tag("")).toThrow("Tag must not be empty");
    expect(() => new Tag("   ")).toThrow("Tag must not be empty");
  });

  it("compares by trimmed value", () => {
    expect(new Tag("work").equals(new Tag(" work "))).toBe(true);
    expect(new Tag("work").equals(new Tag("home"))).toBe(false);
  });
});
