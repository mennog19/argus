import { describe, expect, it } from "vitest";
import { CustomField } from "./custom-field";

describe("CustomField", () => {
  it("stores a trimmed key, value, and protection flag", () => {
    const field = new CustomField("  API Key  ", "abc123", true);

    expect(field.key).toBe("API Key");
    expect(field.value).toBe("abc123");
    expect(field.isProtected).toBe(true);
  });

  it("defaults isProtected to false", () => {
    expect(new CustomField("key", "value").isProtected).toBe(false);
  });

  it("rejects an empty key", () => {
    expect(() => new CustomField("", "value")).toThrow("CustomField key must not be empty");
    expect(() => new CustomField("   ", "value")).toThrow("CustomField key must not be empty");
  });

  it("compares by key, value, and protection flag", () => {
    expect(new CustomField("key", "value").equals(new CustomField("key", "value"))).toBe(true);
    expect(new CustomField("key", "value").equals(new CustomField("key", "other"))).toBe(false);
    expect(
      new CustomField("key", "value", true).equals(new CustomField("key", "value", false)),
    ).toBe(false);
  });

  it("masks the value in toString when protected", () => {
    expect(new CustomField("key", "secret", true).toString()).toBe("key: ••••••••");
  });

  it("shows the value in toString when not protected", () => {
    expect(new CustomField("key", "value").toString()).toBe("key: value");
  });
});
