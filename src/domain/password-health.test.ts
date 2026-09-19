import { describe, expect, it } from "vitest";
import { Entry } from "./entry";
import { Password } from "./password";
import { PasswordHealthPolicy } from "./password-health-policy";
import {
  checkPasswordHealth,
  findDuplicatePasswords,
  findStalePasswords,
  findWeakPasswords,
  isPasswordWeak,
} from "./password-health";

const policy = new PasswordHealthPolicy({ minLength: 10, minCharacterClasses: 3, maxAgeDays: 90 });

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

  it("treats a long password with enough character variety as strong", () => {
    expect(isPasswordWeak(new Password("Correct-Horse7"), policy)).toBe(false);
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

describe("findWeakPasswords", () => {
  it("returns only the entries flagged as weak", () => {
    const weak = entryWithPassword("short");
    const strong = entryWithPassword("Correct-Horse7");

    expect(findWeakPasswords([weak, strong], policy)).toEqual([weak]);
  });
});

describe("findStalePasswords", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("flags entries changed more than maxAgeDays before now", () => {
    const stale = entryWithPassword("old");
    const changedAt = new Date("2025-01-01T00:00:00Z");

    expect(findStalePasswords([{ entry: stale, changedAt }], policy, now)).toEqual([stale]);
  });

  it("does not flag entries changed within maxAgeDays", () => {
    const fresh = entryWithPassword("new");
    const changedAt = new Date("2025-12-15T00:00:00Z");

    expect(findStalePasswords([{ entry: fresh, changedAt }], policy, now)).toEqual([]);
  });

  it("does not flag an entry changed exactly maxAgeDays ago", () => {
    const entry = entryWithPassword("boundary");
    const changedAt = new Date(now.getTime() - policy.maxAgeDays * 24 * 60 * 60 * 1000);

    expect(findStalePasswords([{ entry, changedAt }], policy, now)).toEqual([]);
  });

  it("defaults now to the current time when not provided", () => {
    const entry = entryWithPassword("old");
    const changedAt = new Date("2000-01-01T00:00:00Z");

    expect(findStalePasswords([{ entry, changedAt }], policy)).toEqual([entry]);
  });
});

describe("checkPasswordHealth", () => {
  it("combines duplicate, weak, and stale checks into one report", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const shared = "Correct-Horse7";
    const dup1 = entryWithPassword(shared);
    const dup2 = entryWithPassword(shared);
    const weak = entryWithPassword("short");
    const stale = entryWithPassword("Another-Strong9");

    const report = checkPasswordHealth(
      [
        { entry: dup1, changedAt: now },
        { entry: dup2, changedAt: now },
        { entry: weak, changedAt: now },
        { entry: stale, changedAt: new Date("2000-01-01T00:00:00Z") },
      ],
      policy,
      now,
    );

    expect(report.duplicates).toHaveLength(1);
    expect(report.weak).toEqual([weak]);
    expect(report.stale).toEqual([stale]);
  });
});
