import { describe, expect, it } from "vitest";
import { toggleMember } from "../../src/ui/toggle-member";

describe("toggleMember", () => {
  it("adds a value that isn't in the set", () => {
    expect(toggleMember(new Set(["a"]), "b")).toEqual(new Set(["a", "b"]));
  });

  it("removes a value that is in the set", () => {
    expect(toggleMember(new Set(["a", "b"]), "a")).toEqual(new Set(["b"]));
  });

  it("leaves the original set untouched", () => {
    const original = new Set(["a"]);
    toggleMember(original, "a");
    expect(original).toEqual(new Set(["a"]));
  });
});
