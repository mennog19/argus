import { CustomField } from "./custom-field";
import { CustomFields } from "./custom-fields";
import { Entry } from "./entry";
import { Password } from "./password";

/*
 * KeePass field references: `{REF:<wanted>@<searchIn>:<text>}` stands in for
 * a field of another entry, e.g. `{REF:P@I:0F8E…A2B3}` is "the password of
 * the entry with that uuid". KeePassXC's "clone entry, reference username and
 * password" writes these, so vaults that came from it are full of them.
 *
 * Field letters: T title, U username, P password, A url, N notes, I uuid.
 * `searchIn` additionally takes O, meaning "any custom field value".
 */
const REFERENCE = /\{REF:([TUPANI])@([TUPANIO]):([^}]+)\}/gi;

/**
 * How many references deep a value is followed. KeePass stops at a similar
 * depth; anything legitimately nested is far shallower, and a cycle (an entry
 * whose password refers to itself) must end somewhere.
 */
const MAX_DEPTH = 10;

type FieldLetter = "T" | "U" | "P" | "A" | "N" | "I";

/** An entry's uuid the way KeePass writes it in a reference: 32 upper-case hex digits. */
function referenceUuid(entry: Entry): string {
  return entry.id.toString().replace(/-/g, "").toUpperCase();
}

function fieldValue(entry: Entry, letter: FieldLetter): string {
  switch (letter) {
    case "T":
      return entry.title;
    case "U":
      return entry.username;
    case "P":
      return entry.password.reveal();
    case "A":
      return entry.url;
    case "N":
      return entry.notes;
    case "I":
      return referenceUuid(entry);
  }
}

function matches(entry: Entry, searchIn: string, text: string): boolean {
  const wanted = text.toLowerCase();
  if (searchIn === "I") {
    return referenceUuid(entry) === wanted.replace(/-/g, "").toUpperCase();
  }
  if (searchIn === "O") {
    return entry.customFields.values.some((field) => field.value.toLowerCase() === wanted);
  }
  return fieldValue(entry, searchIn as FieldLetter).toLowerCase() === wanted;
}

/** Whether `value` holds at least one well-formed field reference. */
export function isFieldReference(value: string): boolean {
  return new RegExp(REFERENCE.source, "i").test(value);
}

/**
 * Resolves field references against one vault's entries.
 *
 * Only ever used to *show*, copy, or type a value: the stored entry keeps the
 * reference text, so editing and saving round-trips it untouched — exactly
 * what KeePass and KeePassXC expect to find when they open the file again.
 */
export class FieldReferences {
  constructor(private readonly entries: readonly Entry[]) {}

  /**
   * `value` with every reference replaced by the field it points at. A
   * reference that finds no entry, or is nested too deep, stays as literal
   * text, as it does in KeePass.
   */
  resolve(value: string): string {
    return this.resolveAt(value, 0);
  }

  /**
   * A copy of `entry` with every text field resolved — or `entry` itself when
   * none of them holds a reference, so callers can keep memoizing on it.
   */
  resolveEntry(entry: Entry): Entry {
    const texts = [
      entry.title,
      entry.username,
      entry.password.reveal(),
      entry.url,
      entry.notes,
      ...entry.customFields.values.map((field) => field.value),
    ];
    if (!texts.some(isFieldReference)) {
      return entry;
    }
    return entry.update({
      title: this.resolve(entry.title),
      username: this.resolve(entry.username),
      password: new Password(this.resolve(entry.password.reveal())),
      url: this.resolve(entry.url),
      notes: this.resolve(entry.notes),
      customFields: new CustomFields(
        entry.customFields.values.map(
          (field) => new CustomField(field.key, this.resolve(field.value), field.isProtected),
        ),
      ),
    });
  }

  private resolveAt(value: string, depth: number): string {
    return value.replace(REFERENCE, (reference, wanted: string, searchIn: string, text: string) => {
      if (depth >= MAX_DEPTH) {
        return reference;
      }
      const found = this.entries.find((entry) =>
        matches(entry, searchIn.toUpperCase(), text),
      );
      if (!found) {
        return reference;
      }
      const resolved = this.resolveAt(
        fieldValue(found, wanted.toUpperCase() as FieldLetter),
        depth + 1,
      );
      // Still unresolved at the bottom of the chain: show where it started
      // rather than whatever reference the chain ended on.
      return isFieldReference(resolved) ? reference : resolved;
    });
  }
}
