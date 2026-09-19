import { Entry } from "./entry";
import { EntryId } from "./entry-id";
import { Group } from "./group";
import { GroupId } from "./group-id";

interface TreeUpdate {
  group: Group;
  found: boolean;
}

function updateGroupById(
  group: Group,
  targetId: GroupId,
  transform: (target: Group) => Group,
): TreeUpdate {
  if (group.id.equals(targetId)) {
    return { group: transform(group), found: true };
  }
  return descendAndUpdate(group, (child) => updateGroupById(child, targetId, transform));
}

function updateGroupContainingEntry(
  group: Group,
  entryId: EntryId,
  transform: (owner: Group) => Group,
): TreeUpdate {
  if (group.entries.some((entry) => entry.id.equals(entryId))) {
    return { group: transform(group), found: true };
  }
  return descendAndUpdate(group, (child) => updateGroupContainingEntry(child, entryId, transform));
}

function updateGroupContainingGroup(
  group: Group,
  targetGroupId: GroupId,
  transform: (owner: Group) => Group,
): TreeUpdate {
  if (group.groups.some((child) => child.id.equals(targetGroupId))) {
    return { group: transform(group), found: true };
  }
  return descendAndUpdate(group, (child) =>
    updateGroupContainingGroup(child, targetGroupId, transform),
  );
}

function descendAndUpdate(group: Group, recurse: (child: Group) => TreeUpdate): TreeUpdate {
  for (const child of group.groups) {
    const result = recurse(child);
    if (result.found) {
      return { group: group.replaceGroup(result.group), found: true };
    }
  }
  return { group, found: false };
}

function findGroupInTree(group: Group, id: GroupId): Group | undefined {
  if (group.id.equals(id)) {
    return group;
  }
  for (const child of group.groups) {
    const found = findGroupInTree(child, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function findEntryInTree(group: Group, id: EntryId): Entry | undefined {
  const direct = group.entries.find((entry) => entry.id.equals(id));
  if (direct) {
    return direct;
  }
  for (const child of group.groups) {
    const found = findEntryInTree(child, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * The aggregate root: a named tree of groups and entries. Every mutation
 * returns a new `Vault`, and every mutation that targets a group/entry by id
 * throws if that id isn't found anywhere in the tree, so callers never
 * silently no-op against a stale reference.
 */
export class Vault {
  readonly name: string;
  readonly rootGroup: Group;

  constructor(name: string, rootGroup: Group) {
    this.name = name;
    this.rootGroup = rootGroup;
  }

  static create(name: string): Vault {
    return new Vault(name, Group.create(name));
  }

  findGroup(groupId: GroupId): Group | undefined {
    return findGroupInTree(this.rootGroup, groupId);
  }

  findEntry(entryId: EntryId): Entry | undefined {
    return findEntryInTree(this.rootGroup, entryId);
  }

  addGroup(parentId: GroupId, group: Group): Vault {
    const result = updateGroupById(this.rootGroup, parentId, (parent) => parent.addGroup(group));
    if (!result.found) {
      throw new Error(`Group not found: ${parentId.toString()}`);
    }
    return new Vault(this.name, result.group);
  }

  removeGroup(groupId: GroupId): Vault {
    if (this.rootGroup.id.equals(groupId)) {
      throw new Error("Cannot remove the root group");
    }
    const result = updateGroupContainingGroup(this.rootGroup, groupId, (owner) =>
      owner.removeGroup(groupId),
    );
    if (!result.found) {
      throw new Error(`Group not found: ${groupId.toString()}`);
    }
    return new Vault(this.name, result.group);
  }

  addEntry(groupId: GroupId, entry: Entry): Vault {
    const result = updateGroupById(this.rootGroup, groupId, (group) => group.addEntry(entry));
    if (!result.found) {
      throw new Error(`Group not found: ${groupId.toString()}`);
    }
    return new Vault(this.name, result.group);
  }

  updateEntry(entry: Entry): Vault {
    const result = updateGroupContainingEntry(this.rootGroup, entry.id, (owner) =>
      owner.replaceEntry(entry),
    );
    if (!result.found) {
      throw new Error(`Entry not found: ${entry.id.toString()}`);
    }
    return new Vault(this.name, result.group);
  }

  removeEntry(entryId: EntryId): Vault {
    const result = updateGroupContainingEntry(this.rootGroup, entryId, (owner) =>
      owner.removeEntry(entryId),
    );
    if (!result.found) {
      throw new Error(`Entry not found: ${entryId.toString()}`);
    }
    return new Vault(this.name, result.group);
  }
}
