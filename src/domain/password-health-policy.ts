export interface PasswordHealthPolicyOptions {
  minLength?: number;
  minCharacterClasses?: number;
  strongLength?: number;
  strongCharacterClasses?: number;
}

/**
 * Thresholds for local, offline password strength checks: how short/narrow
 * a password has to be to count as weak, and how long/varied it has to be
 * to count as strong. Anything clearing the weak bar but not the strong one
 * counts as fair. Validated at construction, same as `PasswordPolicy`.
 */
export class PasswordHealthPolicy {
  readonly minLength: number;
  readonly minCharacterClasses: number;
  readonly strongLength: number;
  readonly strongCharacterClasses: number;

  constructor(options: PasswordHealthPolicyOptions = {}) {
    this.minLength = options.minLength ?? 12;
    this.minCharacterClasses = options.minCharacterClasses ?? 3;
    this.strongLength = options.strongLength ?? 16;
    this.strongCharacterClasses = options.strongCharacterClasses ?? 4;

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
    if (!Number.isInteger(this.strongLength) || this.strongLength < this.minLength) {
      throw new Error("strongLength must be an integer at least minLength");
    }
    if (
      !Number.isInteger(this.strongCharacterClasses) ||
      this.strongCharacterClasses < this.minCharacterClasses ||
      this.strongCharacterClasses > 4
    ) {
      throw new Error(
        "strongCharacterClasses must be an integer between minCharacterClasses and 4",
      );
    }
  }
}
