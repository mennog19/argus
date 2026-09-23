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
    const reordered = [
      ...withoutMoving.slice(0, insertAt),
      moving,
      ...withoutMoving.slice(insertAt),
    ];

    return new Group(this.id, this.name, reordered, this.groupEntries, this.icon);
  }
}
