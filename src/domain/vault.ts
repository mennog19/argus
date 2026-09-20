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

const RECYCLE_BIN_NAME = "Recycle Bin";

/**
 * The aggregate root: a named tree of groups and entries. Every mutation
 * returns a new `Vault`, and every mutation that targets a group/entry by id
 * throws if that id isn't found anywhere in the tree, so callers never
 * silently no-op against a stale reference.
 */
export class Vault {
  readonly name: string;
  readonly rootGroup: Group;
  readonly recycleBinId: GroupId | undefined;

  constructor(name: string, rootGroup: Group, recycleBinId?: GroupId) {
    this.name = name;
    this.rootGroup = rootGroup;
    this.recycleBinId = recycleBinId;
  }

  static create(name: string): Vault {
    return new Vault(name, Group.create(name));
  }

  get recycleBin(): Group | undefined {
    return this.recycleBinId ? this.findGroup(this.recycleBinId) : undefined;
  }

  findGroup(groupId: GroupId): Group | undefined {
    return findGroupInTree(this.rootGroup, groupId);
  }

  findEntry(entryId: EntryId): Entry | undefined {
    return findEntryInTree(this.rootGroup, entryId);
  }

  /** True when `groupId` is the recycle bin group itself, or nested inside it. */
  isInRecycleBin(groupId: GroupId): boolean {
    const bin = this.recycleBin;
    return bin !== undefined && findGroupInTree(bin, groupId) !== undefined;
  }

  addGroup(parentId: GroupId, group: Group): Vault {
    const result = updateGroupById(this.rootGroup, parentId, (parent) => parent.addGroup(group));
    if (!result.found) {
      throw new Error(`Group not found: ${parentId.toString()}`);
    }
    return new Vault(this.name, result.group, this.recycleBinId);
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
    return new Vault(this.name, result.group, this.recycleBinId);
  }

  renameGroup(groupId: GroupId, name: string): Vault {
    const result = updateGroupById(this.rootGroup, groupId, (group) => group.rename(name));
    if (!result.found) {
      throw new Error(`Group not found: ${groupId.toString()}`);
    }
    return new Vault(this.name, result.group, this.recycleBinId);
  }

  addEntry(groupId: GroupId, entry: Entry): Vault {
    const result = updateGroupById(this.rootGroup, groupId, (group) => group.addEntry(entry));
    if (!result.found) {
      throw new Error(`Group not found: ${groupId.toString()}`);
    }
    return new Vault(this.name, result.group, this.recycleBinId);
  }

  updateEntry(entry: Entry): Vault {
    const result = updateGroupContainingEntry(this.rootGroup, entry.id, (owner) =>
      owner.replaceEntry(entry),
    );
    if (!result.found) {
      throw new Error(`Entry not found: ${entry.id.toString()}`);
    }
    return new Vault(this.name, result.group, this.recycleBinId);
  }

  removeEntry(entryId: EntryId): Vault {
    const result = updateGroupContainingEntry(this.rootGroup, entryId, (owner) =>
      owner.removeEntry(entryId),
    );
    if (!result.found) {
      throw new Error(`Entry not found: ${entryId.toString()}`);
    }
    return new Vault(this.name, result.group, this.recycleBinId);
  }

  /** Creates the recycle bin group under the root, if one doesn't already exist. */
  private ensureRecycleBin(): { vault: Vault; recycleBinId: GroupId } {
    if (this.recycleBinId && this.findGroup(this.recycleBinId)) {
      return { vault: this, recycleBinId: this.recycleBinId };
    }
    const bin = Group.create(RECYCLE_BIN_NAME);
    const rootWithBin = this.rootGroup.addGroup(bin);
    return { vault: new Vault(this.name, rootWithBin, bin.id), recycleBinId: bin.id };
  }

  /** Soft-deletes an entry by moving it into the recycle bin (created lazily if needed). */
  deleteEntry(entryId: EntryId): Vault {
    const entry = this.findEntry(entryId);
    if (!entry) {
      throw new Error(`Entry not found: ${entryId.toString()}`);
    }
    const { vault, recycleBinId } = this.ensureRecycleBin();
    return vault.removeEntry(entryId).addEntry(recycleBinId, entry);
  }

  /** Soft-deletes a group (with its full subtree) by moving it into the recycle bin. */
  deleteGroup(groupId: GroupId): Vault {
    if (this.rootGroup.id.equals(groupId)) {
      throw new Error("Cannot remove the root group");
    }
    if (this.recycleBinId?.equals(groupId)) {
      throw new Error("Cannot delete the recycle bin");
    }
    const group = this.findGroup(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId.toString()}`);
    }
    const { vault, recycleBinId } = this.ensureRecycleBin();
    return vault.removeGroup(groupId).addGroup(recycleBinId, group);
  }

  /** Moves a recycled entry back out of the recycle bin into `targetGroupId`. */
  restoreEntry(entryId: EntryId, targetGroupId: GroupId): Vault {
    const entry = this.findEntry(entryId);
    if (!entry) {
      throw new Error(`Entry not found: ${entryId.toString()}`);
    }
    return this.removeEntry(entryId).addEntry(targetGroupId, entry);
  }

  /** Moves a recycled group back out of the recycle bin into `targetGroupId`. */
  restoreGroup(groupId: GroupId, targetGroupId: GroupId): Vault {
    const group = this.findGroup(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId.toString()}`);
    }
    if (findGroupInTree(group, targetGroupId)) {
      throw new Error("Cannot restore a group into itself or one of its own subgroups");
    }
    return this.removeGroup(groupId).addGroup(targetGroupId, group);
  }

  /** Permanently deletes everything currently in the recycle bin, leaving it empty. */
  emptyRecycleBin(): Vault {
    if (!this.recycleBinId) {
      return this;
    }
    const result = updateGroupById(
      this.rootGroup,
      this.recycleBinId,
      (bin) => new Group(bin.id, bin.name),
    );
    if (!result.found) {
      return this;
    }
    return new Vault(this.name, result.group, this.recycleBinId);
  }
}
