import { CustomFields } from "./custom-fields";
import { EntryId } from "./entry-id";
import { Password } from "./password";
import { Tags } from "./tags";

export interface EntryFields {
  title?: string;
  username?: string;
  password?: Password;
  url?: string;
  notes?: string;
  tags?: Tags;
  customFields?: CustomFields;
}

/**
 * A single credential record. Identity is `id`; two entries with the same id
 * represent the same entry at different points in time.
 */
export class Entry {
  readonly id: EntryId;
  readonly title: string;
  readonly username: string;
  readonly password: Password;
  readonly url: string;
  readonly notes: string;
  readonly tags: Tags;
  readonly customFields: CustomFields;

  constructor(id: EntryId, fields: EntryFields = {}) {
    this.id = id;
    this.title = fields.title ?? "";
    this.username = fields.username ?? "";
    this.password = fields.password ?? new Password("");
    this.url = fields.url ?? "";
    this.notes = fields.notes ?? "";
    this.tags = fields.tags ?? new Tags();
    this.customFields = fields.customFields ?? new CustomFields();
  }

  static create(fields: EntryFields = {}): Entry {
    return new Entry(EntryId.create(), fields);
  }

  equals(other: Entry): boolean {
    return other.id.equals(this.id);
  }

  update(fields: EntryFields): Entry {
    return new Entry(this.id, {
      title: fields.title ?? this.title,
      username: fields.username ?? this.username,
      password: fields.password ?? this.password,
      url: fields.url ?? this.url,
      notes: fields.notes ?? this.notes,
      tags: fields.tags ?? this.tags,
      customFields: fields.customFields ?? this.customFields,
    });
  }
}
