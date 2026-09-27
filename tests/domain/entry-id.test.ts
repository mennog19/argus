import { describe, expect, it } from "vitest";
import { EntryId } from "../../src/domain/entry-id";

describe("EntryId", () => {
  it("creates unique ids", () => {
    const a = EntryId.create();
    const b = EntryId.create();

    expect(a.equals(b)).toBe(false);
  });

  it("round-trips through a string", () => {
    const id = EntryId.create();
    const restored = EntryId.fromString(id.toString());

    expect(restored.equals(id)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(() => EntryId.fromString("")).toThrow("EntryId value must not be empty");
    expect(() => EntryId.fromString("   ")).toThrow("EntryId value must not be empty");
  });

  it("is not equal to an id with a different value", () => {
    const a = EntryId.fromString("a");
    const b = EntryId.fromString("b");

    expect(a.equals(b)).toBe(false);
  });
});
