import { Entry, Group, GroupId } from "../domain";

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

/** Only `group`'s own entries (not its subgroups'), paired with `group` itself. */
export function entriesOf(group: Group): EntryWithGroup[] {
  return group.entries.map((entry) => ({ entry, group }));
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
