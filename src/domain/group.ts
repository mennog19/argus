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

  /**
   * This group with `changes` applied. Identity (`id`) is never part of
   * `changes`: a modified group is still the same group.
   */
  private with(changes: {
    name?: string;
    groups?: readonly Group[];
    entries?: readonly Entry[];
    icon?: Icon;
  }): Group {
    return new Group(
      this.id,
      changes.name ?? this.name,
      changes.groups ?? this.childGroups,
      changes.entries ?? this.groupEntries,
      changes.icon ?? this.icon,
    );
  }

  rename(name: string): Group {
    return this.with({ name });
  }

  changeIcon(icon: Icon): Group {
    return this.with({ icon });
  }

  addEntry(entry: Entry): Group {
    return this.with({ entries: [...this.groupEntries, entry] });
  }

  replaceEntry(entry: Entry): Group {
    return this.with({
      entries: this.groupEntries.map((e) => (e.id.equals(entry.id) ? entry : e)),
    });
  }

  removeEntry(entryId: EntryId): Group {
    return this.with({ entries: this.groupEntries.filter((e) => !e.id.equals(entryId)) });
  }

  addGroup(group: Group): Group {
    return this.with({ groups: [...this.childGroups, group] });
  }

  replaceGroup(group: Group): Group {
    return this.with({ groups: this.childGroups.map((g) => (g.id.equals(group.id) ? group : g)) });
  }

  removeGroup(groupId: GroupId): Group {
    return this.with({ groups: this.childGroups.filter((g) => !g.id.equals(groupId)) });
  }

  /**
   * Reorders a child group to sit immediately before `beforeId` among its
   * siblings, or at the end when `beforeId` is `undefined`. Both ids must
   * belong to this group's direct children.
   */
  moveGroupBefore(groupId: GroupId, beforeId: GroupId | undefined): Group {
    const movingIndex = this.childGroups.findIndex((g) => g.id.equals(groupId));
    if (movingIndex === -1) {
      throw new Error(`Group not found: ${groupId.toString()}`);
    }
    if (beforeId !== undefined && !beforeId.equals(groupId)) {
      const targetExists = this.childGroups.some((g) => g.id.equals(beforeId));
      if (!targetExists) {
        throw new Error(`Group not found: ${beforeId.toString()}`);
      }
    }
    if (beforeId === undefined && movingIndex === this.childGroups.length - 1) {
      return this;
    }
    if (
      beforeId !== undefined &&
      (beforeId.equals(groupId) || this.childGroups[movingIndex + 1]?.id.equals(beforeId))
    ) {
      return this;
    }

    const moving = this.childGroups[movingIndex];
    const withoutMoving = this.childGroups.filter((g) => !g.id.equals(groupId));
    const insertAt =
      beforeId === undefined
        ? withoutMoving.length
        : withoutMoving.findIndex((g) => g.id.equals(beforeId));
    return this.with({
      groups: [...withoutMoving.slice(0, insertAt), moving, ...withoutMoving.slice(insertAt)],
    });
  }
}
