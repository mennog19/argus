export class EntryId {
  private constructor(private readonly value: string) {}

  static create(): EntryId {
    return new EntryId(crypto.randomUUID());
  }

  static fromString(value: string): EntryId {
    if (value.trim() === "") {
      throw new Error("EntryId value must not be empty");
    }
    return new EntryId(value);
  }

  equals(other: EntryId): boolean {
    return other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
