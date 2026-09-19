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
