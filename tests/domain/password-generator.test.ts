import { afterEach, describe, expect, it, vi } from "vitest";
import { cryptoRandomInt, generatePassword } from "../../src/domain/password-generator";
import { PasswordPolicy } from "../../src/domain/password-policy";

describe("cryptoRandomInt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubRandomValues(...draws: number[]): void {
    const spy = vi.spyOn(crypto, "getRandomValues");
    for (const draw of draws) {
      spy.mockImplementationOnce(<T extends ArrayBufferView | null>(array: T): T => {
        (array as unknown as Uint32Array)[0] = draw;
        return array;
      });
    }
  }

  it("reduces an accepted draw modulo maxExclusive", () => {
    stubRandomValues(17);

    expect(cryptoRandomInt(10)).toBe(7);
  });

  it("rejects draws in the biased tail above the largest multiple of maxExclusive", () => {
    // 2^32 % 10 === 6, so draws >= 2^32 - 6 would over-weight 0..5.
    stubRandomValues(2 ** 32 - 1, 2 ** 32 - 6, 2 ** 32 - 7);

    expect(cryptoRandomInt(10)).toBe((2 ** 32 - 7) % 10);
    expect(crypto.getRandomValues).toHaveBeenCalledTimes(3);
  });
});

describe("generatePassword", () => {
  it("produces a deterministic character password when randomInt is fixed", () => {
    const policy = new PasswordPolicy({ length: 5 });

    const password = generatePassword(policy, () => 0);

    expect(password.reveal()).toBe("a0AAA");
  });

  it("stops adding guaranteed characters once the target length is reached", () => {
    const policy = new PasswordPolicy({ length: 2, useSymbols: true });

    const password = generatePassword(policy, () => 0);

    expect(password.reveal()).toBe("aA");
  });

  it("produces a deterministic passphrase when randomInt is fixed", () => {
    const policy = new PasswordPolicy({ mode: "passphrase", wordCount: 3, separator: "_" });

    const password = generatePassword(policy, () => 0);

    expect(password.reveal()).toBe("anchor_anchor_anchor");
  });

  it("joins passphrase words with the configured separator", () => {
    const policy = new PasswordPolicy({ mode: "passphrase", wordCount: 2, separator: "." });
    let call = 0;
    const values = [0, 1];

    const password = generatePassword(policy, () => values[call++]);

    expect(password.reveal().split(".")).toHaveLength(2);
  });

  it("falls back to crypto-backed randomness when no source is injected", () => {
    const policy = new PasswordPolicy({ length: 20, useSymbols: true, excludeAmbiguous: true });

    const password = generatePassword(policy);
    const value = password.reveal();

    expect(value).toHaveLength(20);
    expect(value).toMatch(/[A-Z]/);
    expect(value).toMatch(/[a-z]/);
    expect(value).toMatch(/[0-9]/);
    expect(value).toMatch(/[!@#$%^&*()\-_=+[\]{}<>?]/);
  });

  it("uses crypto-backed randomness for passphrases by default", () => {
    const policy = new PasswordPolicy({ mode: "passphrase" });

    const password = generatePassword(policy);

    expect(password.reveal().split("-")).toHaveLength(4);
  });
});
