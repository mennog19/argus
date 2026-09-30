import { CustomFields } from "./custom-fields";
import { Entry } from "./entry";
import { Tags } from "./tags";

/** The parts of an entry a user edits, in the order the entry shows them. */
export type EntryFieldName =
  "title" | "username" | "password" | "url" | "notes" | "tags" | "customFields" | "icon" | "expiry";

function tagsKey(tags: Tags): string {
  return JSON.stringify(tags.values.map((tag) => tag.toString()).sort());
}

function customFieldsKey(fields: CustomFields): string {
  return JSON.stringify(
    fields.values
      .map((field) => [field.key, field.value, field.isProtected])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
}

const COMPARISONS: readonly [EntryFieldName, (a: Entry, b: Entry) => boolean][] = [
  ["title", (a, b) => a.title === b.title],
  ["username", (a, b) => a.username === b.username],
  ["password", (a, b) => a.password.reveal() === b.password.reveal()],
  ["url", (a, b) => a.url === b.url],
  ["notes", (a, b) => a.notes === b.notes],
  ["tags", (a, b) => tagsKey(a.tags) === tagsKey(b.tags)],
  ["customFields", (a, b) => customFieldsKey(a.customFields) === customFieldsKey(b.customFields)],
  ["icon", (a, b) => a.icon.equals(b.icon)],
  ["expiry", (a, b) => a.expiresAt?.getTime() === b.expiresAt?.getTime()],
];

/**
 * Which fields differ between two versions of an entry, e.g. a history
 * revision and the version that replaced it. Timestamps don't count, and
 * neither does the order tags or custom fields happen to be listed in.
 */
export function changedEntryFields(older: Entry, newer: Entry): EntryFieldName[] {
  return COMPARISONS.filter(([, same]) => !same(older, newer)).map(([field]) => field);
}
