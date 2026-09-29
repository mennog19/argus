import { Entry, FieldReferences, Group, GroupId, matchesSearchQuery } from "../domain";

export interface EntryWithGroup {
  readonly entry: Entry;
  readonly group: Group;
}

function isExcluded(group: Group, excludeIds: readonly GroupId[]): boolean {
  return excludeIds.some((id) => id.equals(group.id));
}

/**
 * Every entry in `group` and all of its descendants, paired with its direct
 * parent group. Descendants whose id is in `excludeIds` (and everything
 * nested inside them) are skipped — used to keep recycle bin contents out of
 * "All Items".
 */
export function collectAllEntries(
  group: Group,
  excludeIds: readonly GroupId[] = [],
): EntryWithGroup[] {
  const own: EntryWithGroup[] = group.entries.map((entry) => ({ entry, group }));
  const nested = group.groups
    .filter((child) => !isExcluded(child, excludeIds))
    .flatMap((child) => collectAllEntries(child, excludeIds));
  return [...own, ...nested];
}

/**
 * A resolver for `{REF:…}` placeholders that can reach every entry under
 * `rootGroup`, the recycle bin included — KeePass resolves against the whole
 * file, and a reference shouldn't break just because its target was binned.
 */
export function fieldReferencesOf(rootGroup: Group): FieldReferences {
  return new FieldReferences(collectAllEntries(rootGroup).map(({ entry }) => entry));
}

/** Only `group`'s own entries (not its subgroups'), paired with `group` itself. */
export function entriesOf(group: Group): EntryWithGroup[] {
  return group.entries.map((entry) => ({ entry, group }));
}

/**
 * Entries (paired with their group) whose entry matches `query` — see
 * `matchesSearchQuery` for what counts as a match. Callers typically pass
 * the result of `collectAllEntries` (already excluding the recycle bin) so
 * search never surfaces deleted entries.
 */
export function searchEntries(entries: readonly EntryWithGroup[], query: string): EntryWithGroup[] {
  return entries.filter(({ entry }) => matchesSearchQuery(entry, query));
}

export interface GroupOption {
  readonly id: string;
  readonly label: string;
}

/**
 * `group` and every descendant, flattened depth-first with each nested
 * level's `label` indented two spaces per level — for populating a group
 * `<select>` while keeping the tree's shape legible. Descendants whose id is
 * in `excludeIds` (and everything nested inside them) are skipped — used to
 * keep the recycle bin out of group pickers.
 */
export function flattenGroupOptions(
  group: Group,
  excludeIds: readonly GroupId[] = [],
  depth = 0,
): GroupOption[] {
  const own: GroupOption = { id: group.id.toString(), label: "  ".repeat(depth) + group.name };
  const nested = group.groups
    .filter((child) => !isExcluded(child, excludeIds))
    .flatMap((child) => flattenGroupOptions(child, excludeIds, depth + 1));
  return [own, ...nested];
}

export interface GroupContents {
  /** Entries in the group itself and in every descendant group. */
  readonly entries: number;
  /** Descendant groups at any depth. */
  readonly groups: number;
}

/**
 * Everything `group` carries with it when it's moved as a whole — used by the
 * recycle bin to say how much restoring a deleted group would put back.
 */
export function countGroupContents(group: Group): GroupContents {
  return group.groups.reduce<GroupContents>(
    (total, child) => {
      const nested = countGroupContents(child);
      return {
        entries: total.entries + nested.entries,
        groups: total.groups + 1 + nested.groups,
      };
    },
    { entries: group.entries.length, groups: 0 },
  );
}
