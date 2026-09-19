const MASK = "••••••••";

/**
 * Wraps a secret so it never leaks into logs or serialized output by accident
 * — `toString`/`toJSON` mask it, and the real value is only ever available
 * through `reveal()`, an explicit, greppable call site.
 */
export class Password {
  constructor(private readonly value: string) {}

  reveal(): string {
    return this.value;
  }

  equals(other: Password): boolean {
    return other.value === this.value;
  }

  toString(): string {
    return MASK;
  }

  toJSON(): string {
    return MASK;
  }
}
