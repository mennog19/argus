export class CustomField {
  readonly key: string;

  constructor(
    key: string,
    readonly value: string,
    readonly isProtected: boolean = false,
  ) {
    const trimmedKey = key.trim();
    if (trimmedKey === "") {
      throw new Error("CustomField key must not be empty");
    }
    this.key = trimmedKey;
  }

  equals(other: CustomField): boolean {
    return (
      other.key === this.key && other.value === this.value && other.isProtected === this.isProtected
    );
  }

  toString(): string {
    return this.isProtected ? `${this.key}: ••••••••` : `${this.key}: ${this.value}`;
  }
}
