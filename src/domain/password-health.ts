import { Entry } from "./entry";
import { Password } from "./password";
import { PasswordHealthPolicy } from "./password-health-policy";

const CHARACTER_CLASS_PATTERNS = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];

export type PasswordStrength = "weak" | "fair" | "strong";

export interface PasswordHealthReport {
  /** Groups of two or more entries that share the same non-empty password. */
  readonly duplicates: readonly (readonly Entry[])[];
  /**
   * Entries with no password at all, e.g. ones that sign in through another
   * account. There's nothing to rate, so they're kept out of the tiers.
   */
  readonly noPassword: readonly Entry[];
  /** Entries not already counted under `duplicates` or `noPassword`, by strength tier. */
  readonly weak: readonly Entry[];
  readonly fair: readonly Entry[];
  readonly strong: readonly Entry[];
}

function characterClassCount(value: string): number {
  return CHARACTER_CLASS_PATTERNS.filter((pattern) => pattern.test(value)).length;
}

/** An empty, too-short, or too-narrow (few character classes) password is weak. */
export function isPasswordWeak(password: Password, policy: PasswordHealthPolicy): boolean {
  const value = password.reveal();
  if (value === "") {
    return true;
  }
  return value.length < policy.minLength || characterClassCount(value) < policy.minCharacterClasses;
}

/** Weak/fair/strong tier for a password, independent of whether it's reused elsewhere. */
export function passwordStrength(
  password: Password,
  policy: PasswordHealthPolicy,
): PasswordStrength {
  if (isPasswordWeak(password, policy)) {
    return "weak";
  }
  const value = password.reveal();
  const isStrong =
    value.length >= policy.strongLength &&
    characterClassCount(value) >= policy.strongCharacterClasses;
  return isStrong ? "strong" : "fair";
}

export function findDuplicatePasswords(entries: readonly Entry[]): Entry[][] {
  const byPassword = new Map<string, Entry[]>();
  for (const entry of entries) {
    const value = entry.password.reveal();
    if (value === "") {
      continue;
    }
    const group = byPassword.get(value);
    if (group) {
      group.push(entry);
    } else {
      byPassword.set(value, [entry]);
    }
  }
  return Array.from(byPassword.values()).filter((group) => group.length > 1);
}

/**
 * Runs every local health check against a vault's entries and returns a
 * combined report. Reuse takes priority over strength: an entry whose
 * password is reused elsewhere is only counted under `duplicates`, even if
 * that password would otherwise also be weak, so every entry lands in
 * exactly one category. An entry without a password isn't rated at all.
 */
export function checkPasswordHealth(
  entries: readonly Entry[],
  policy: PasswordHealthPolicy,
): PasswordHealthReport {
  const duplicates = findDuplicatePasswords(entries);
  const reusedIds = new Set(duplicates.flat().map((entry) => entry.id.toString()));

  const noPassword: Entry[] = [];
  const weak: Entry[] = [];
  const fair: Entry[] = [];
  const strong: Entry[] = [];
  for (const entry of entries) {
    if (reusedIds.has(entry.id.toString())) {
      continue;
    }
    if (entry.password.reveal() === "") {
      noPassword.push(entry);
      continue;
    }
    const tier = passwordStrength(entry.password, policy);
    if (tier === "weak") {
      weak.push(entry);
    } else if (tier === "fair") {
      fair.push(entry);
    } else {
      strong.push(entry);
    }
  }

  return { duplicates, noPassword, weak, fair, strong };
}
