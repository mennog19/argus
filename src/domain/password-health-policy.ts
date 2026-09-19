export interface PasswordHealthPolicyOptions {
  minLength?: number;
  minCharacterClasses?: number;
  maxAgeDays?: number;
}

/**
 * Thresholds for local, offline password health checks: how short/narrow a
 * password has to be to count as weak, and how long it can go unchanged
 * before counting as stale. Validated at construction, same as
 * `PasswordPolicy`.
 */
export class PasswordHealthPolicy {
  readonly minLength: number;
  readonly minCharacterClasses: number;
  readonly maxAgeDays: number;

  constructor(options: PasswordHealthPolicyOptions = {}) {
    this.minLength = options.minLength ?? 12;
    this.minCharacterClasses = options.minCharacterClasses ?? 3;
    this.maxAgeDays = options.maxAgeDays ?? 90;

    if (!Number.isInteger(this.minLength) || this.minLength < 1) {
      throw new Error("minLength must be a positive integer");
    }
    if (
      !Number.isInteger(this.minCharacterClasses) ||
      this.minCharacterClasses < 1 ||
      this.minCharacterClasses > 4
    ) {
      throw new Error("minCharacterClasses must be an integer between 1 and 4");
    }
    if (!Number.isInteger(this.maxAgeDays) || this.maxAgeDays < 1) {
      throw new Error("maxAgeDays must be a positive integer");
    }
  }
}
