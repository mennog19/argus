export interface PasswordPolicyOptions {
  length?: number;
  useUppercase?: boolean;
  useLowercase?: boolean;
  useDigits?: boolean;
  useSymbols?: boolean;
  excludeAmbiguous?: boolean;
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
 * Configuration for generating a random-character password: a length and
 * which character sets to draw from. Validated at construction so an
 * instance is always usable — callers never have to re-check invariants
 * before generating from it.
 */
export class PasswordPolicy {
  readonly length: number;
  readonly useUppercase: boolean;
  readonly useLowercase: boolean;
  readonly useDigits: boolean;
  readonly useSymbols: boolean;
  readonly excludeAmbiguous: boolean;

  constructor(options: PasswordPolicyOptions = {}) {
    this.length = options.length ?? 16;
    this.useUppercase = options.useUppercase ?? true;
    this.useLowercase = options.useLowercase ?? true;
    this.useDigits = options.useDigits ?? true;
    this.useSymbols = options.useSymbols ?? false;
    this.excludeAmbiguous = options.excludeAmbiguous ?? false;

    if (!Number.isInteger(this.length) || this.length < 1) {
      throw new Error("length must be a positive integer");
    }
    if (!this.useUppercase && !this.useLowercase && !this.useDigits && !this.useSymbols) {
      throw new Error("At least one character set must be enabled");
    }
  }

  /**
   * The enabled character sets (ambiguous characters filtered out if
   * configured), in a fixed order.
   */
  characterPools(): readonly string[] {
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
