import { Entry } from "./entry";

function includes(value: string, lowerCaseQuery: string): boolean {
  return value.toLowerCase().includes(lowerCaseQuery);
}

/**
 * Whether `entry` matches `query`: a case-insensitive substring match against
 * title, username, URL, notes, tags, and custom field keys/values. The
 * password itself is never searched. An empty (or whitespace-only) query
 * matches every entry.
 */
export function matchesSearchQuery(entry: Entry, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return true;
  }
  return (
    includes(entry.title, trimmed) ||
    includes(entry.username, trimmed) ||
    includes(entry.url, trimmed) ||
    includes(entry.notes, trimmed) ||
    entry.tags.values.some((tag) => includes(tag.toString(), trimmed)) ||
    entry.customFields.values.some(
      (field) => includes(field.key, trimmed) || includes(field.value, trimmed),
    )
  );
}
