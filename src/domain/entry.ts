import { CustomFields } from "./custom-fields";
import { Icon } from "./icon";
import { EntryId } from "./entry-id";
import { Password } from "./password";
import { Tags } from "./tags";

/**
 * The KDBX timestamps an entry carries. All optional: an entry created in
 * memory has none until the repository stamps them on save, and a KDBX file
 * is free to omit them.
 *
 * These are metadata, not content — the mapper's change detection ignores
 * them deliberately, so recording that an entry was opened never counts as an
 * edit and never pushes an entry history revision.
 */
export interface EntryTimes {
  readonly createdAt?: Date;
  readonly modifiedAt?: Date;
  readonly accessedAt?: Date;
}

export interface EntryFields {
  title?: string;
  username?: string;
  password?: Password;
  url?: string;
  notes?: string;
  tags?: Tags;
  customFields?: CustomFields;
  icon?: Icon;
  times?: EntryTimes;
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
  readonly icon: Icon;
  readonly times: EntryTimes;

  constructor(id: EntryId, fields: EntryFields = {}) {
    this.id = id;
    this.title = fields.title ?? "";
    this.username = fields.username ?? "";
    this.password = fields.password ?? new Password("");
    this.url = fields.url ?? "";
    this.notes = fields.notes ?? "";
    this.tags = fields.tags ?? new Tags();
    this.customFields = fields.customFields ?? new CustomFields();
    this.icon = fields.icon ?? Icon.AUTO;
    this.times = fields.times ?? {};
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
      icon: fields.icon ?? this.icon,
      times: fields.times ?? this.times,
    });
  }

  /** The same entry with `at` recorded as when it was last opened. */
  markAccessed(at: Date): Entry {
    return this.update({ times: { ...this.times, accessedAt: at } });
  }
}
