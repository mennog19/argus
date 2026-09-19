import { Entry } from "./entry";
import { Password } from "./password";
import { PasswordHealthPolicy } from "./password-health-policy";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CHARACTER_CLASS_PATTERNS = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];

/**
 * An entry paired with when its password was last changed. The domain
 * `Entry` doesn't carry this timestamp itself (it comes from KDBX times via
 * the repository layer), so health checks that need it take it alongside
 * the entry rather than assuming it's on the model.
 */
export interface EntryPasswordAge {
  readonly entry: Entry;
  readonly changedAt: Date;
}

export interface PasswordHealthReport {
  readonly duplicates: readonly (readonly Entry[])[];
  readonly weak: readonly Entry[];
  readonly stale: readonly Entry[];
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

/** Groups of two or more entries that share the same non-empty password. */
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

export function findWeakPasswords(
  entries: readonly Entry[],
  policy: PasswordHealthPolicy,
): Entry[] {
  return entries.filter((entry) => isPasswordWeak(entry.password, policy));
}

/** Entries whose password hasn't been changed within the policy's max age, as of `now`. */
export function findStalePasswords(
  entries: readonly EntryPasswordAge[],
  policy: PasswordHealthPolicy,
  now: Date = new Date(),
): Entry[] {
  const maxAgeMs = policy.maxAgeDays * MS_PER_DAY;
  return entries
    .filter(({ changedAt }) => now.getTime() - changedAt.getTime() > maxAgeMs)
    .map(({ entry }) => entry);
}

/** Runs every local health check against a vault's entries and returns a combined report. */
export function checkPasswordHealth(
  entries: readonly EntryPasswordAge[],
  policy: PasswordHealthPolicy,
  now: Date = new Date(),
): PasswordHealthReport {
  const allEntries = entries.map(({ entry }) => entry);
  return {
    duplicates: findDuplicatePasswords(allEntries),
    weak: findWeakPasswords(allEntries, policy),
    stale: findStalePasswords(entries, policy, now),
  };
}
