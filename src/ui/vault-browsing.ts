import { Entry, Group } from "../domain";

export interface EntryWithGroup {
  readonly entry: Entry;
  readonly group: Group;
}

/** Every entry in `group` and all of its descendants, paired with its direct parent group. */
export function collectAllEntries(group: Group): EntryWithGroup[] {
  const own: EntryWithGroup[] = group.entries.map((entry) => ({ entry, group }));
  const nested = group.groups.flatMap((child) => collectAllEntries(child));
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
 * `<select>` while keeping the tree's shape legible.
 */
export function flattenGroupOptions(group: Group, depth = 0): GroupOption[] {
  const own: GroupOption = { id: group.id.toString(), label: "  ".repeat(depth) + group.name };
  const nested = group.groups.flatMap((child) => flattenGroupOptions(child, depth + 1));
  return [own, ...nested];
}
