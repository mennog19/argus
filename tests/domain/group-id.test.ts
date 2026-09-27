import { describe, expect, it } from "vitest";
import { GroupId } from "../../src/domain/group-id";

describe("GroupId", () => {
  it("creates unique ids", () => {
    const a = GroupId.create();
    const b = GroupId.create();

    expect(a.equals(b)).toBe(false);
  });

  it("round-trips through a string", () => {
    const id = GroupId.create();
    const restored = GroupId.fromString(id.toString());

    expect(restored.equals(id)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(() => GroupId.fromString("")).toThrow("GroupId value must not be empty");
    expect(() => GroupId.fromString("   ")).toThrow("GroupId value must not be empty");
  });

  it("is not equal to an id with a different value", () => {
    const a = GroupId.fromString("a");
    const b = GroupId.fromString("b");

    expect(a.equals(b)).toBe(false);
  });
});
