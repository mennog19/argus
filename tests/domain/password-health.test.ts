import { describe, expect, it } from "vitest";
import { Entry } from "../../src/domain/entry";
import { Password } from "../../src/domain/password";
import { PasswordHealthPolicy } from "../../src/domain/password-health-policy";
import {
  checkPasswordHealth,
  findDuplicatePasswords,
  isPasswordWeak,
  passwordStrength,
} from "../../src/domain/password-health";

const policy = new PasswordHealthPolicy({
  minLength: 10,
  minCharacterClasses: 3,
  strongLength: 16,
  strongCharacterClasses: 4,
});

function entryWithPassword(value: string): Entry {
  return Entry.create({ password: new Password(value) });
}

describe("isPasswordWeak", () => {
  it("treats an empty password as weak", () => {
    expect(isPasswordWeak(new Password(""), policy)).toBe(true);
  });

  it("treats a password shorter than minLength as weak", () => {
    expect(isPasswordWeak(new Password("Ab1!"), policy)).toBe(true);
  });

  it("treats a long password with too few character classes as weak", () => {
    expect(isPasswordWeak(new Password("aaaaaaaaaaaaaa"), policy)).toBe(true);
  });

  it("treats a long password with enough character variety as not weak", () => {
    expect(isPasswordWeak(new Password("Correct-Horse7"), policy)).toBe(false);
  });
});

describe("passwordStrength", () => {
  it("returns weak for a password below the weak bar", () => {
    expect(passwordStrength(new Password("short"), policy)).toBe("weak");
  });

  it("returns fair for a password that clears the weak bar but not the strong one", () => {
    expect(passwordStrength(new Password("Correct-Horse7"), policy)).toBe("fair");
  });

  it("returns strong for a password that clears the strong bar", () => {
    expect(passwordStrength(new Password("Correct-Horse-Battery9!"), policy)).toBe("strong");
  });
});

describe("findDuplicatePasswords", () => {
  it("groups entries that share the same non-empty password", () => {
    const shared = "Correct-Horse7";
    const a = entryWithPassword(shared);
    const b = entryWithPassword(shared);
    const unique = entryWithPassword("SomethingElse9!");

    const duplicates = findDuplicatePasswords([a, b, unique]);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].map((e) => e.id.toString()).sort()).toEqual(
      [a.id.toString(), b.id.toString()].sort(),
    );
  });

  it("ignores entries with an empty password", () => {
    const a = entryWithPassword("");
    const b = entryWithPassword("");

    expect(findDuplicatePasswords([a, b])).toEqual([]);
  });

  it("returns nothing when every password is unique", () => {
    const entries = [entryWithPassword("one"), entryWithPassword("two")];

    expect(findDuplicatePasswords(entries)).toEqual([]);
  });
});

describe("checkPasswordHealth", () => {
  it("sorts each entry into exactly one category", () => {
    const shared = "Correct-Horse7";
    const dup1 = entryWithPassword(shared);
    const dup2 = entryWithPassword(shared);
    const weak = entryWithPassword("short");
    const fair = entryWithPassword("Another-Fair9");
    const strong = entryWithPassword("Correct-Horse-Battery9!");

    const report = checkPasswordHealth([dup1, dup2, weak, fair, strong], policy);

    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].map((e) => e.id.toString()).sort()).toEqual(
      [dup1.id.toString(), dup2.id.toString()].sort(),
    );
    expect(report.weak).toEqual([weak]);
    expect(report.fair).toEqual([fair]);
    expect(report.strong).toEqual([strong]);
  });

  it("gives reuse priority over strength, excluding a weak-and-reused entry from `weak`", () => {
    const shared = "short";
    const dup1 = entryWithPassword(shared);
    const dup2 = entryWithPassword(shared);

    const report = checkPasswordHealth([dup1, dup2], policy);

    expect(report.duplicates).toHaveLength(1);
    expect(report.weak).toEqual([]);
    expect(report.fair).toEqual([]);
    expect(report.strong).toEqual([]);
  });
});
