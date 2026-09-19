import { describe, expect, it } from "vitest";
import { Password } from "./password";

describe("Password", () => {
  it("reveals the underlying value", () => {
    const password = new Password("hunter2");

    expect(password.reveal()).toBe("hunter2");
  });

  it("masks the value in toString", () => {
    const password = new Password("hunter2");

    expect(password.toString()).toBe("••••••••");
    expect(`${password}`).not.toContain("hunter2");
  });

  it("masks the value when JSON-serialized", () => {
    const password = new Password("hunter2");

    expect(JSON.stringify({ password })).not.toContain("hunter2");
    expect(JSON.stringify({ password })).toContain("••••••••");
  });

  it("compares by underlying value regardless of masking", () => {
    expect(new Password("hunter2").equals(new Password("hunter2"))).toBe(true);
    expect(new Password("hunter2").equals(new Password("other"))).toBe(false);
  });

  it("allows an empty password", () => {
    expect(new Password("").reveal()).toBe("");
  });
});
