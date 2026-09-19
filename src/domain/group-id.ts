export class GroupId {
  private constructor(private readonly value: string) {}

  static create(): GroupId {
    return new GroupId(crypto.randomUUID());
  }

  static fromString(value: string): GroupId {
    if (value.trim() === "") {
      throw new Error("GroupId value must not be empty");
    }
    return new GroupId(value);
  }

  equals(other: GroupId): boolean {
    return other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
