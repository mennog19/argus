import { CustomField } from "./custom-field";

/**
 * An immutable collection of custom fields, keyed by field key. Setting a
 * field with an already-used key replaces the existing one, mirroring how
 * KDBX custom fields work. Every mutation returns a new instance.
 */
export class CustomFields {
  private readonly items: ReadonlyMap<string, CustomField>;

  constructor(fields: readonly CustomField[] = []) {
    const map = new Map<string, CustomField>();
    for (const field of fields) {
      map.set(field.key, field);
    }
    this.items = map;
  }

  get values(): readonly CustomField[] {
    return Array.from(this.items.values());
  }

  get(key: string): CustomField | undefined {
    return this.items.get(key);
  }

  set(field: CustomField): CustomFields {
    // Map.set on an existing key keeps its original iteration position,
    // which is what makes this an in-place replace rather than a
    // remove-then-append.
    const map = new Map(this.items);
    map.set(field.key, field);
    return new CustomFields(Array.from(map.values()));
  }

  remove(key: string): CustomFields {
    return new CustomFields(this.values.filter((f) => f.key !== key));
  }
}
