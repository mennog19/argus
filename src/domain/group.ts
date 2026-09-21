import { Entry } from "./entry";
import { EntryId } from "./entry-id";
import { GroupId } from "./group-id";
import { Icon } from "./icon";

/**
 * A named container for entries and nested sub-groups. Identity is `id`.
 * Every mutation returns a new `Group` rather than changing this one.
 */
export class Group {
  readonly id: GroupId;
  readonly name: string;
  readonly icon: Icon;
  private readonly childGroups: readonly Group[];
  private readonly groupEntries: readonly Entry[];

  constructor(
    id: GroupId,
    name: string,
    groups: readonly Group[] = [],
    entries: readonly Entry[] = [],
    icon: Icon = Icon.AUTO,
  ) {
    this.id = id;
    this.name = name;
    this.childGroups = groups;
    this.groupEntries = entries;
    this.icon = icon;
  }

  static create(name: string): Group {
    return new Group(GroupId.create(), name);
  }

  get groups(): readonly Group[] {
    return this.childGroups;
  }

  get entries(): readonly Entry[] {
    return this.groupEntries;
  }

  equals(other: Group): boolean {
    return other.id.equals(this.id);
  }

  rename(name: string): Group {
    return new Group(this.id, name, this.childGroups, this.groupEntries, this.icon);
  }

  changeIcon(icon: Icon): Group {
    return new Group(this.id, this.name, this.childGroups, this.groupEntries, icon);
  }

  addEntry(entry: Entry): Group {
    return new Group(
      this.id,
      this.name,
      this.childGroups,
      [...this.groupEntries, entry],
      this.icon,
    );
  }

  replaceEntry(entry: Entry): Group {
    return new Group(
      this.id,
      this.name,
      this.childGroups,
      this.groupEntries.map((e) => (e.id.equals(entry.id) ? entry : e)),
      this.icon,
    );
  }

  removeEntry(entryId: EntryId): Group {
    return new Group(
      this.id,
      this.name,
      this.childGroups,
      this.groupEntries.filter((e) => !e.id.equals(entryId)),
      this.icon,
    );
  }

  addGroup(group: Group): Group {
    return new Group(
      this.id,
      this.name,
      [...this.childGroups, group],
      this.groupEntries,
      this.icon,
    );
  }

  replaceGroup(group: Group): Group {
    return new Group(
      this.id,
      this.name,
      this.childGroups.map((g) => (g.id.equals(group.id) ? group : g)),
      this.groupEntries,
      this.icon,
    );
  }

  removeGroup(groupId: GroupId): Group {
    return new Group(
      this.id,
      this.name,
      this.childGroups.filter((g) => !g.id.equals(groupId)),
      this.groupEntries,
      this.icon,
    );
  }
}
