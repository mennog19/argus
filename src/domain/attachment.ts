/**
 * The largest file Argus will attach. The whole vault is re-encrypted and
 * rewritten on every save, and its rolling backups each hold a copy, so a
 * vault is a poor place for big files. Larger attachments added in KeePass or
 * KeePassXC still load and are kept.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * A file stored inside an entry (a KDBX binary). `name` is the key the entry
 * holds it under, normally the file's name. The bytes are kept exactly as the
 * file holds them and nothing here interprets them.
 */
export class Attachment {
  constructor(
    readonly name: string,
    readonly data: Uint8Array,
  ) {
    if (name.trim() === "") {
      throw new Error("An attachment needs a name.");
    }
  }

  get size(): number {
    return this.data.byteLength;
  }

  hasSameData(other: Attachment): boolean {
    const a = this.data;
    const b = other.data;
    // Attachments mapped from one open document share their bytes, so the
    // byte-by-byte walk is only paid for a file that was just added.
    return (
      a === b || (a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]))
    );
  }
}

/** `report.pdf` as `["report", ".pdf"]`. A leading dot is part of the name, not an extension. */
function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** An entry's attachments, in file order, at most one per name. Every change returns a new set. */
export class Attachments {
  static readonly EMPTY = new Attachments();

  private readonly byName: ReadonlyMap<string, Attachment>;

  constructor(attachments: readonly Attachment[] = []) {
    this.byName = new Map(attachments.map((attachment) => [attachment.name, attachment]));
  }

  get values(): readonly Attachment[] {
    return Array.from(this.byName.values());
  }

  get size(): number {
    return this.byName.size;
  }

  get(name: string): Attachment | undefined {
    return this.byName.get(name);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** `name` if nothing here uses it yet, otherwise the first free `name (2).ext`, `name (3).ext`, … */
  availableName(name: string): string {
    const [stem, extension] = splitExtension(name);
    let candidate = name;
    for (let copy = 2; this.has(candidate); copy++) {
      candidate = `${stem} (${copy})${extension}`;
    }
    return candidate;
  }

  /**
   * Adds `attachment` without replacing anything: when its name is already
   * taken it goes in under the next free one.
   */
  attach(attachment: Attachment): Attachments {
    const name = this.availableName(attachment.name);
    return new Attachments([...this.values, new Attachment(name, attachment.data)]);
  }

  /** Renames an attachment in place. Throws when `newName` is blank or already taken. */
  rename(name: string, newName: string): Attachments {
    if (name === newName || !this.has(name)) {
      return this;
    }
    if (this.has(newName)) {
      throw new Error(`There's already an attachment named "${newName}".`);
    }
    return new Attachments(
      this.values.map((attachment) =>
        attachment.name === name ? new Attachment(newName, attachment.data) : attachment,
      ),
    );
  }

  remove(name: string): Attachments {
    return this.has(name)
      ? new Attachments(this.values.filter((attachment) => attachment.name !== name))
      : this;
  }

  /**
   * These attachments plus the ones in `other` that aren't here yet. A file
   * here under the same name with different contents is kept, and the other
   * one goes in beside it under the next free name.
   */
  merge(other: Attachments): Attachments {
    return other.values.reduce<Attachments>((merged, attachment) => {
      const existing = merged.get(attachment.name);
      return existing?.hasSameData(attachment) ? merged : merged.attach(attachment);
    }, this);
  }

  /** Whether both hold the same files under the same names, in any order. */
  equals(other: Attachments): boolean {
    return (
      this.size === other.size &&
      this.values.every((attachment) => {
        const match = other.get(attachment.name);
        return match !== undefined && match.hasSameData(attachment);
      })
    );
  }
}
