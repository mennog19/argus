import { EntrySortId } from "../application/settings";
import { EntryWithGroup } from "./vault-browsing";

/**
 * Which way an order runs, so the menu can show it as a glyph instead of
 * spelling it out again. `"none"` is the vault's own order, which has no
 * direction to reverse.
 */
export type EntrySortDirection = "none" | "asc" | "desc";

export interface EntrySortOption {
  readonly id: EntrySortId;
  readonly label: string;
  readonly direction: EntrySortDirection;
}

/** The sort orders offered in the entry list, in the order they're listed. */
export const ENTRY_SORT_OPTIONS: readonly EntrySortOption[] = [
  { id: "manual", label: "Vault order", direction: "none" },
  { id: "title-asc", label: "Title (A–Z)", direction: "asc" },
  { id: "title-desc", label: "Title (Z–A)", direction: "desc" },
  { id: "accessed-desc", label: "Recently opened", direction: "desc" },
  { id: "accessed-asc", label: "Least recently opened", direction: "asc" },
];

function compareTitles(a: EntryWithGroup, b: EntryWithGroup): number {
  return a.entry.title.localeCompare(b.entry.title, undefined, { sensitivity: "base" });
}

/**
 * Entries never opened sort last in *both* directions: "no timestamp" means
 * unknown, not "opened infinitely long ago", so burying them is less
 * misleading than claiming they're the least recently used.
 */
function compareAccessed(a: EntryWithGroup, b: EntryWithGroup, newestFirst: boolean): number {
  const aTime = a.entry.times.accessedAt?.getTime();
  const bTime = b.entry.times.accessedAt?.getTime();
  if (aTime === undefined || bTime === undefined) {
    if (aTime === bTime) {
      return 0;
    }
    return aTime === undefined ? 1 : -1;
  }
  return newestFirst ? bTime - aTime : aTime - bTime;
}

/**
 * `entries` reordered per `sort`. `"manual"` returns them untouched — that's
 * the vault's own order, which is what gets written to the `.kdbx` file.
 * Sorting is stable, so entries the chosen order can't tell apart (same
 * title, both never opened) keep their vault order relative to each other.
 */
export function sortEntries(
  entries: readonly EntryWithGroup[],
  sort: EntrySortId,
): EntryWithGroup[] {
  switch (sort) {
    case "manual":
      return [...entries];
    case "title-asc":
      return [...entries].sort(compareTitles);
    case "title-desc":
      return [...entries].sort((a, b) => compareTitles(b, a));
    case "accessed-desc":
      return [...entries].sort((a, b) => compareAccessed(a, b, true));
    case "accessed-asc":
      return [...entries].sort((a, b) => compareAccessed(a, b, false));
  }
}
