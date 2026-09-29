import { describe, expect, it } from "vitest";
import { PasswordPolicy } from "../../src/domain/password-policy";

describe("PasswordPolicy", () => {
  it("defaults to a 16-character policy using upper/lower/digits", () => {
    const policy = new PasswordPolicy();

    expect(policy.length).toBe(16);
    expect(policy.useUppercase).toBe(true);
    expect(policy.useLowercase).toBe(true);
    expect(policy.useDigits).toBe(true);
    expect(policy.useSymbols).toBe(false);
    expect(policy.excludeAmbiguous).toBe(false);
  });

  it("accepts explicit overrides", () => {
    const policy = new PasswordPolicy({
      length: 24,
      useSymbols: true,
      useDigits: false,
      excludeAmbiguous: true,
    });

    expect(policy.length).toBe(24);
    expect(policy.useSymbols).toBe(true);
    expect(policy.useDigits).toBe(false);
    expect(policy.excludeAmbiguous).toBe(true);
  });

  it("rejects a non-positive length", () => {
    expect(() => new PasswordPolicy({ length: 0 })).toThrow("length must be a positive integer");
    expect(() => new PasswordPolicy({ length: -5 })).toThrow("length must be a positive integer");
  });

  it("rejects a fractional length", () => {
    expect(() => new PasswordPolicy({ length: 8.5 })).toThrow("length must be a positive integer");
  });

  it("rejects a character policy with every character set disabled", () => {
    expect(
      () =>
        new PasswordPolicy({
          useUppercase: false,
          useLowercase: false,
          useDigits: false,
          useSymbols: false,
        }),
    ).toThrow("At least one character set must be enabled");
  });

  describe("characterPools", () => {
    it("returns one pool per enabled character set, in a fixed order", () => {
      const policy = new PasswordPolicy({ useSymbols: true });

      expect(policy.characterPools()).toEqual([
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "abcdefghijklmnopqrstuvwxyz",
        "0123456789",
        "!@#$%^&*()-_=+[]{}<>?",
      ]);
    });

    it("omits pools for disabled character sets", () => {
      const policy = new PasswordPolicy({ useUppercase: false, useDigits: false });

      expect(policy.characterPools()).toEqual(["abcdefghijklmnopqrstuvwxyz"]);
    });

    it("omits the lowercase pool when disabled", () => {
      const policy = new PasswordPolicy({ useLowercase: false });

      expect(policy.characterPools()).toEqual(["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0123456789"]);
    });

    it("filters ambiguous characters out of each pool when configured", () => {
      const policy = new PasswordPolicy({ useSymbols: true, excludeAmbiguous: true });
      const [upper, lower, digits, symbols] = policy.characterPools();

      expect(upper).not.toContain("I");
      expect(upper).not.toContain("O");
      expect(lower).not.toContain("l");
      expect(lower).not.toContain("o");
      expect(digits).not.toContain("0");
      expect(digits).not.toContain("1");
      expect(symbols).toBe("!@#$%^&*()-_=+[]{}<>?");
    });
  });
});
