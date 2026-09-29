/**
 * Shortest master password Argus accepts when creating a vault or changing
 * its password. Deliberately below the health check's weak-password length:
 * length is only one of the rules below, not the whole of them.
 */
export const MASTER_PASSWORD_MIN_LENGTH = 8;

/** One rule a new master password has to meet, in the order they're reported. */
export type MasterPasswordRequirement = "length" | "uppercase" | "digit" | "symbol";

const RULES: readonly (readonly [MasterPasswordRequirement, (password: string) => boolean])[] = [
  ["length", (password) => password.length >= MASTER_PASSWORD_MIN_LENGTH],
  ["uppercase", (password) => /\p{Lu}/u.test(password)],
  ["digit", (password) => /\p{Nd}/u.test(password)],
  // Anything that isn't a letter, digit, or whitespace, so punctuation and
  // currency signs from any keyboard layout count; a space doesn't.
  ["symbol", (password) => /[^\p{L}\p{N}\s]/u.test(password)],
];

/**
 * The rules `password` doesn't meet yet, empty when it's acceptable. Only
 * ever applied to a *new* master password: an existing vault opens with
 * whatever password it already has.
 */
export function unmetMasterPasswordRequirements(password: string): MasterPasswordRequirement[] {
  return RULES.filter(([, isMet]) => !isMet(password)).map(([requirement]) => requirement);
}
