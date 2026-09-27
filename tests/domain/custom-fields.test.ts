import { describe, expect, it } from "vitest";
import { CustomField } from "../../src/domain/custom-field";
import { CustomFields } from "../../src/domain/custom-fields";

describe("CustomFields", () => {
  it("starts empty by default", () => {
    expect(new CustomFields().values).toEqual([]);
  });

  it("de-duplicates by key on construction, keeping the last value", () => {
    const fields = new CustomFields([
      new CustomField("key", "first"),
      new CustomField("key", "second"),
    ]);

    expect(fields.values).toHaveLength(1);
    expect(fields.get("key")?.value).toBe("second");
  });

  it("gets a field by key", () => {
    const fields = new CustomFields([new CustomField("key", "value")]);

    expect(fields.get("key")?.value).toBe("value");
    expect(fields.get("missing")).toBeUndefined();
  });

  it("sets a new field without mutating the original", () => {
    const original = new CustomFields([new CustomField("a", "1")]);
    const updated = original.set(new CustomField("b", "2"));

    expect(original.values.map((f) => f.key)).toEqual(["a"]);
    expect(updated.values.map((f) => f.key)).toEqual(["a", "b"]);
  });

  it("setting an existing key replaces it in place", () => {
    const original = new CustomFields([new CustomField("a", "1"), new CustomField("b", "2")]);
    const updated = original.set(new CustomField("a", "updated"));

    expect(updated.values.map((f) => `${f.key}:${f.value}`)).toEqual(["a:updated", "b:2"]);
  });

  it("removes a field by key without mutating the original", () => {
    const original = new CustomFields([new CustomField("a", "1"), new CustomField("b", "2")]);
    const updated = original.remove("a");

    expect(original.values.map((f) => f.key)).toEqual(["a", "b"]);
    expect(updated.values.map((f) => f.key)).toEqual(["b"]);
  });
});
