export class Tag {
  private readonly value: string;

  constructor(value: string) {
    const trimmed = value.trim();
    if (trimmed === "") {
      throw new Error("Tag must not be empty");
    }
    this.value = trimmed;
  }

  equals(other: Tag): boolean {
    return other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
