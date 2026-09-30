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
  /**
   * When the entry stops being valid, as KeePass's "Expires" option. Unlike
   * `times` this is content: the user sets it, so changing it is an edit.
   * Passing `undefined` explicitly to `update` clears it.
   */
  expiresAt?: Date;
  times?: EntryTimes;
  history?: readonly Entry[];
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
  readonly expiresAt: Date | undefined;
  readonly times: EntryTimes;
  /**
   * Earlier versions of this entry, oldest first, the way KDBX keeps them:
   * each is the whole entry as it was before an edit. The repository adds one
   * whenever a save changes the entry, so nothing here pushes revisions.
   */
  readonly history: readonly Entry[];

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
    this.expiresAt = fields.expiresAt;
    this.times = fields.times ?? {};
    this.history = fields.history ?? [];
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
      expiresAt: "expiresAt" in fields ? fields.expiresAt : this.expiresAt,
      times: fields.times ?? this.times,
      history: fields.history ?? this.history,
    });
  }

  /** Whether the entry's expiry date has been reached by `now`. */
  isExpired(now: Date): boolean {
    return this.expiresAt !== undefined && this.expiresAt.getTime() <= now.getTime();
  }

  /** The same entry with `at` recorded as when it was last opened. */
  markAccessed(at: Date): Entry {
    return this.update({ times: { ...this.times, accessedAt: at } });
  }

  /**
   * Brings back what the entry held at revision `index`. Only the contents
   * change: saving it is an ordinary edit, so the version it replaces becomes
   * the newest revision, as in KeePass.
   */
  restoreRevision(index: number): Entry {
    const revision = this.revisionAt(index);
    return this.update({
      title: revision.title,
      username: revision.username,
      password: revision.password,
      url: revision.url,
      notes: revision.notes,
      tags: revision.tags,
      customFields: revision.customFields,
      icon: revision.icon,
      expiresAt: revision.expiresAt,
    });
  }

  /** The same entry without revision `index`, e.g. to purge an old password from the file. */
  deleteRevision(index: number): Entry {
    this.revisionAt(index);
    return this.update({ history: this.history.filter((_, i) => i !== index) });
  }

  private revisionAt(index: number): Entry {
    const revision = this.history[index];
    if (!revision) {
      throw new Error(`No revision ${index} in this entry's history`);
    }
    return revision;
  }
}
