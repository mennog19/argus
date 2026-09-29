export const PASSWORD_POLICY_MODES = ["characters", "passphrase"] as const;
export type PasswordPolicyMode = (typeof PASSWORD_POLICY_MODES)[number];

export const PASSPHRASE_SEPARATORS = ["-", "_", " ", "."] as const;
export type PassphraseSeparator = (typeof PASSPHRASE_SEPARATORS)[number];

export interface PasswordPolicyOptions {
  mode?: PasswordPolicyMode;
  length?: number;
  useUppercase?: boolean;
  useLowercase?: boolean;
  useDigits?: boolean;
  useSymbols?: boolean;
  excludeAmbiguous?: boolean;
  wordCount?: number;
  separator?: PassphraseSeparator;
}

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}<>?";

// Characters that are easy to mis-key or misread against each other
// (capital I / lowercase l / digit 1, capital O / digit 0 / lowercase o).
const AMBIGUOUS = new Set(["I", "l", "1", "O", "0", "o"]);

function withoutAmbiguous(pool: string): string {
  return Array.from(pool)
    .filter((char) => !AMBIGUOUS.has(char))
    .join("");
}

/**
 * Configuration for generating a password: either a random-character
 * password (length + character-set toggles) or a passphrase (word count +
 * separator). Validated at construction so an instance is always usable —
 * callers never have to re-check invariants before generating from it.
 */
export class PasswordPolicy {
  readonly mode: PasswordPolicyMode;
  readonly length: number;
  readonly useUppercase: boolean;
  readonly useLowercase: boolean;
  readonly useDigits: boolean;
  readonly useSymbols: boolean;
  readonly excludeAmbiguous: boolean;
  readonly wordCount: number;
  readonly separator: PassphraseSeparator;

  constructor(options: PasswordPolicyOptions = {}) {
    this.mode = options.mode ?? "characters";
    this.length = options.length ?? 16;
    this.useUppercase = options.useUppercase ?? true;
    this.useLowercase = options.useLowercase ?? true;
    this.useDigits = options.useDigits ?? true;
    this.useSymbols = options.useSymbols ?? false;
    this.excludeAmbiguous = options.excludeAmbiguous ?? false;
    this.wordCount = options.wordCount ?? 4;
    this.separator = options.separator ?? "-";

    if (this.mode === "characters") {
      if (!Number.isInteger(this.length) || this.length < 1) {
        throw new Error("length must be a positive integer");
      }
      if (!this.useUppercase && !this.useLowercase && !this.useDigits && !this.useSymbols) {
        throw new Error("At least one character set must be enabled");
      }
    } else {
      if (!Number.isInteger(this.wordCount) || this.wordCount < 1) {
        throw new Error("wordCount must be a positive integer");
      }
    }
  }

  /**
   * The enabled character sets (ambiguous characters filtered out if
   * configured), in a fixed order. Empty when `mode` is `"passphrase"`.
   */
  characterPools(): readonly string[] {
    if (this.mode === "passphrase") {
      return [];
    }
    const pools: string[] = [];
    if (this.useUppercase) {
      pools.push(this.filtered(UPPERCASE));
    }
    if (this.useLowercase) {
      pools.push(this.filtered(LOWERCASE));
    }
    if (this.useDigits) {
      pools.push(this.filtered(DIGITS));
    }
    if (this.useSymbols) {
      pools.push(this.filtered(SYMBOLS));
    }
    return pools;
  }

  private filtered(pool: string): string {
    return this.excludeAmbiguous ? withoutAmbiguous(pool) : pool;
  }
}
