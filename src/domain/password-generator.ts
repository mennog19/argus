import { PASSPHRASE_WORDLIST } from "./passphrase-wordlist";
import { Password } from "./password";
import { PasswordPolicy } from "./password-policy";

/** Returns a uniformly random integer in `[0, maxExclusive)`. */
export type RandomInt = (maxExclusive: number) => number;

const UINT32_RANGE = 2 ** 32;

/**
 * `crypto.getRandomValues`-backed {@link RandomInt}. Uses rejection sampling:
 * draws at or above the largest multiple of `maxExclusive` that fits in a
 * uint32 are discarded, so `% maxExclusive` has no modulo bias.
 */
export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
};

/**
 * Generates a password from a policy. `randomInt` is injectable so tests can
 * supply deterministic values instead of stubbing the Web Crypto API — it
 * defaults to a `crypto.getRandomValues`-backed source for real use.
 */
export function generatePassword(
  policy: PasswordPolicy,
  randomInt: RandomInt = cryptoRandomInt,
): Password {
  const value =
    policy.mode === "passphrase"
      ? generatePassphrase(policy, randomInt)
      : generateCharacterPassword(policy, randomInt);
  return new Password(value);
}

function generateCharacterPassword(policy: PasswordPolicy, randomInt: RandomInt): string {
  const pools = policy.characterPools();
  const combinedPool = pools.join("");
  const chars: string[] = [];

  // Guarantee at least one character from each enabled set, so a policy that
  // enables symbols actually produces passwords containing symbols.
  for (const pool of pools) {
    if (chars.length >= policy.length) {
      break;
    }
    chars.push(pool[randomInt(pool.length)]);
  }
  while (chars.length < policy.length) {
    chars.push(combinedPool[randomInt(combinedPool.length)]);
  }

  return shuffle(chars, randomInt).join("");
}

function generatePassphrase(policy: PasswordPolicy, randomInt: RandomInt): string {
  const words = Array.from(
    { length: policy.wordCount },
    () => PASSPHRASE_WORDLIST[randomInt(PASSPHRASE_WORDLIST.length)],
  );
  return words.join(policy.separator);
}

function shuffle(items: readonly string[], randomInt: RandomInt): string[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
