import { describe, expect, it } from "vitest";
import { PasswordHealthPolicy } from "./password-health-policy";

describe("PasswordHealthPolicy", () => {
  it("defaults to a 12-character minimum, 3 character classes, and 90-day max age", () => {
    const policy = new PasswordHealthPolicy();

    expect(policy.minLength).toBe(12);
    expect(policy.minCharacterClasses).toBe(3);
    expect(policy.maxAgeDays).toBe(90);
  });

  it("accepts explicit overrides", () => {
    const policy = new PasswordHealthPolicy({
      minLength: 16,
      minCharacterClasses: 2,
      maxAgeDays: 30,
    });

    expect(policy.minLength).toBe(16);
    expect(policy.minCharacterClasses).toBe(2);
    expect(policy.maxAgeDays).toBe(30);
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

  it("rejects a non-positive maxAgeDays", () => {
    expect(() => new PasswordHealthPolicy({ maxAgeDays: 0 })).toThrow(
      "maxAgeDays must be a positive integer",
    );
  });

  it("rejects a fractional maxAgeDays", () => {
    expect(() => new PasswordHealthPolicy({ maxAgeDays: 10.5 })).toThrow(
      "maxAgeDays must be a positive integer",
    );
  });
});
