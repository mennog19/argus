import { describe, expect, it } from "vitest";
import { PasswordPolicy } from "./password-policy";

describe("PasswordPolicy", () => {
  it("defaults to a 16-character policy using upper/lower/digits", () => {
    const policy = new PasswordPolicy();

    expect(policy.mode).toBe("characters");
    expect(policy.length).toBe(16);
    expect(policy.useUppercase).toBe(true);
    expect(policy.useLowercase).toBe(true);
    expect(policy.useDigits).toBe(true);
    expect(policy.useSymbols).toBe(false);
    expect(policy.excludeAmbiguous).toBe(false);
  });

  it("defaults passphrase settings to 4 words joined with a hyphen", () => {
    const policy = new PasswordPolicy({ mode: "passphrase" });

    expect(policy.wordCount).toBe(4);
    expect(policy.separator).toBe("-");
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

  it("rejects a non-positive length in character mode", () => {
    expect(() => new PasswordPolicy({ length: 0 })).toThrow("length must be a positive integer");
    expect(() => new PasswordPolicy({ length: -5 })).toThrow("length must be a positive integer");
  });

  it("rejects a fractional length in character mode", () => {
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

  it("rejects a non-positive word count in passphrase mode", () => {
    expect(() => new PasswordPolicy({ mode: "passphrase", wordCount: 0 })).toThrow(
      "wordCount must be a positive integer",
    );
  });

  it("rejects a fractional word count in passphrase mode", () => {
    expect(() => new PasswordPolicy({ mode: "passphrase", wordCount: 2.5 })).toThrow(
      "wordCount must be a positive integer",
    );
  });

  it("does not validate character-set/length rules in passphrase mode", () => {
    expect(
      () =>
        new PasswordPolicy({
          mode: "passphrase",
          length: 0,
          useUppercase: false,
          useLowercase: false,
          useDigits: false,
          useSymbols: false,
        }),
    ).not.toThrow();
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

    it("returns an empty array in passphrase mode", () => {
      const policy = new PasswordPolicy({ mode: "passphrase" });

      expect(policy.characterPools()).toEqual([]);
    });
  });
});
