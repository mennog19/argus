import { describe, expect, it } from "vitest";
import { PasswordHealthPolicy } from "./password-health-policy";

describe("PasswordHealthPolicy", () => {
  it("defaults to a 12-char/3-class weak bar and a 16-char/4-class strong bar", () => {
    const policy = new PasswordHealthPolicy();

    expect(policy.minLength).toBe(12);
    expect(policy.minCharacterClasses).toBe(3);
    expect(policy.strongLength).toBe(16);
    expect(policy.strongCharacterClasses).toBe(4);
  });

  it("accepts explicit overrides", () => {
    const policy = new PasswordHealthPolicy({
      minLength: 8,
      minCharacterClasses: 2,
      strongLength: 20,
      strongCharacterClasses: 3,
    });

    expect(policy.minLength).toBe(8);
    expect(policy.minCharacterClasses).toBe(2);
    expect(policy.strongLength).toBe(20);
    expect(policy.strongCharacterClasses).toBe(3);
  });

  it("rejects a non-positive minLength", () => {
    expect(() => new PasswordHealthPolicy({ minLength: 0 })).toThrow(
      "minLength must be a positive integer",
    );
  });

  it("rejects a fractional minLength", () => {
    expect(() => new PasswordHealthPolicy({ minLength: 1.5 })).toThrow(
      "minLength must be a positive integer",
    );
  });

  it("rejects a minCharacterClasses outside 1-4", () => {
    expect(() => new PasswordHealthPolicy({ minCharacterClasses: 0 })).toThrow(
      "minCharacterClasses must be an integer between 1 and 4",
    );
    expect(() => new PasswordHealthPolicy({ minCharacterClasses: 5 })).toThrow(
      "minCharacterClasses must be an integer between 1 and 4",
    );
  });

  it("rejects a fractional minCharacterClasses", () => {
    expect(() => new PasswordHealthPolicy({ minCharacterClasses: 2.5 })).toThrow(
      "minCharacterClasses must be an integer between 1 and 4",
    );
  });

  it("rejects a strongLength shorter than minLength", () => {
    expect(() => new PasswordHealthPolicy({ minLength: 12, strongLength: 10 })).toThrow(
      "strongLength must be an integer at least minLength",
    );
  });

  it("rejects a fractional strongLength", () => {
    expect(() => new PasswordHealthPolicy({ strongLength: 16.5 })).toThrow(
      "strongLength must be an integer at least minLength",
    );
  });

  it("rejects a strongCharacterClasses below minCharacterClasses or above 4", () => {
    expect(
      () => new PasswordHealthPolicy({ minCharacterClasses: 3, strongCharacterClasses: 2 }),
    ).toThrow("strongCharacterClasses must be an integer between minCharacterClasses and 4");
    expect(() => new PasswordHealthPolicy({ strongCharacterClasses: 5 })).toThrow(
      "strongCharacterClasses must be an integer between minCharacterClasses and 4",
    );
  });

  it("rejects a fractional strongCharacterClasses", () => {
    expect(() => new PasswordHealthPolicy({ strongCharacterClasses: 3.5 })).toThrow(
      "strongCharacterClasses must be an integer between minCharacterClasses and 4",
    );
  });
});
