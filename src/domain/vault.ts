import { CustomIcon, CustomIcons } from "./custom-icon";
import { Entry } from "./entry";
import { EntryId } from "./entry-id";
import { Group } from "./group";
import { GroupId } from "./group-id";
import { Icon } from "./icon";

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

function collectEntriesWithExpiry(
  group: Group,
  skipGroupId: GroupId | undefined,
  found: Entry[],
): Entry[] {
  if (skipGroupId?.equals(group.id)) {
    return found;
  }
  found.push(...group.entries.filter((entry) => entry.expiresAt !== undefined));
  for (const child of group.groups) {
    collectEntriesWithExpiry(child, skipGroupId, found);
  }
  return found;
}

/** `group`'s subtree with every entry and group showing `icon` switched to the automatic icon. */
function withoutIcon(group: Group, icon: Icon): Group {
  let next = group.icon.equals(icon) ? group.changeIcon(Icon.AUTO) : group;
  for (const entry of group.entries) {
    if (entry.icon.equals(icon)) {
      next = next.replaceEntry(entry.update({ icon: Icon.AUTO }));
    }
  }
  for (const child of group.groups) {
    const updated = withoutIcon(child, icon);
    if (updated !== child) {
      next = next.replaceGroup(updated);
    }
  }
  return next;
}

function countIconUses(group: Group, icon: Icon): number {
  let count = group.icon.equals(icon) ? 1 : 0;
  count += group.entries.filter((entry) => entry.icon.equals(icon)).length;
  for (const child of group.groups) {
    count += countIconUses(child, icon);
  }
  return count;
}

function referencedCustomIconIds(group: Group, found = new Set<string>()): Set<string> {
  const icons = [
    group.icon,
    ...group.entries.flatMap((entry) => [entry.icon, ...entry.history.map((rev) => rev.icon)]),
  ];
  for (const icon of icons) {
    if (icon.kind === "custom") {
      found.add(icon.key);
    }
  }
  for (const child of group.groups) {
    referencedCustomIconIds(child, found);
  }
  return found;
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
  /**
   * Entries removed with {@link purgeEntry} since the vault was loaded. The
   * file mapper treats any other entry missing from the tree as deleted and
   * moves it to the recycle bin, so a purge has to be told apart from that.
   */
  readonly purgedEntryIds: readonly EntryId[];
  /** The image icons stored in the vault, whether or not anything uses them. */
  readonly customIcons: CustomIcons;

  constructor(
    name: string,
    rootGroup: Group,
    recycleBinId?: GroupId,
    purgedEntryIds: readonly EntryId[] = [],
    customIcons: CustomIcons = CustomIcons.EMPTY,
  ) {
    this.name = name;
    this.rootGroup = rootGroup;
    this.recycleBinId = recycleBinId;
    this.purgedEntryIds = purgedEntryIds;
    this.customIcons = customIcons;
  }

  /** This vault with `changes` applied; everything not named is carried over. */
  private with(changes: {
    name?: string;
    rootGroup?: Group;
    recycleBinId?: GroupId;
    purgedEntryIds?: readonly EntryId[];
    customIcons?: CustomIcons;
  }): Vault {
    return new Vault(
      changes.name ?? this.name,
      changes.rootGroup ?? this.rootGroup,
      changes.recycleBinId ?? this.recycleBinId,
      changes.purgedEntryIds ?? this.purgedEntryIds,
      changes.customIcons ?? this.customIcons,
    );
  }

  static create(name: string): Vault {
    return new Vault(name, Group.create(name));
  }

  /**
   * The same vault under a new name. Only the vault's own name changes: its
   * root group keeps the name it has, as in KeePass.
   */
  rename(name: string): Vault {
    const trimmed = name.trim();
    if (trimmed === "") {
      throw new Error("A vault needs a name");
    }
    return this.with({ name: trimmed });
  }

  get recycleBin(): Group | undefined {
    return this.recycleBinId ? this.findGroup(this.recycleBinId) : undefined;
  }

  /**
   * A new `Vault` around the tree `result` produced, or a thrown error when
   * the mutation never found what it was aiming at. Every id-targeted
   * mutation ends this way, so that "not found" is a failure rather than a
   * silent no-op against a stale reference.
   */
  private rebuilt(result: TreeUpdate, notFoundMessage: string): Vault {
    if (!result.found) {
      throw new Error(notFoundMessage);
    }
    return this.with({ rootGroup: result.group });
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
    return this.rebuilt(
      updateGroupById(this.rootGroup, parentId, (parent) => parent.addGroup(group)),
      `Group not found: ${parentId.toString()}`,
    );
  }

  removeGroup(groupId: GroupId): Vault {
    if (this.rootGroup.id.equals(groupId)) {
      throw new Error("Cannot remove the root group");
    }
    return this.rebuilt(
      updateGroupContainingGroup(this.rootGroup, groupId, (owner) => owner.removeGroup(groupId)),
      `Group not found: ${groupId.toString()}`,
    );
  }

  /**
   * Reorders `groupId` to sit immediately before `beforeId` among its
   * siblings, or at the end when `beforeId` is `undefined`. Both ids must
   * belong to the same parent group.
   */
  reorderGroup(groupId: GroupId, beforeId: GroupId | undefined): Vault {
    return this.rebuilt(
      updateGroupContainingGroup(this.rootGroup, groupId, (owner) =>
        owner.moveGroupBefore(groupId, beforeId),
      ),
      `Group not found: ${groupId.toString()}`,
    );
  }

  renameGroup(groupId: GroupId, name: string): Vault {
    return this.rebuilt(
      updateGroupById(this.rootGroup, groupId, (group) => group.rename(name)),
      `Group not found: ${groupId.toString()}`,
    );
  }

  changeGroupIcon(groupId: GroupId, icon: Icon): Vault {
    return this.rebuilt(
      updateGroupById(this.rootGroup, groupId, (group) => group.changeIcon(icon)),
      `Group not found: ${groupId.toString()}`,
    );
  }

  addEntry(groupId: GroupId, entry: Entry): Vault {
    return this.rebuilt(
      updateGroupById(this.rootGroup, groupId, (group) => group.addEntry(entry)),
      `Group not found: ${groupId.toString()}`,
    );
  }

  updateEntry(entry: Entry): Vault {
    return this.rebuilt(
      updateGroupContainingEntry(this.rootGroup, entry.id, (owner) => owner.replaceEntry(entry)),
      `Entry not found: ${entry.id.toString()}`,
    );
  }

  removeEntry(entryId: EntryId): Vault {
    return this.rebuilt(
      updateGroupContainingEntry(this.rootGroup, entryId, (owner) => owner.removeEntry(entryId)),
      `Entry not found: ${entryId.toString()}`,
    );
  }

  /** Creates the recycle bin group under the root, if one doesn't already exist. */
  private ensureRecycleBin(): { vault: Vault; recycleBinId: GroupId } {
    if (this.recycleBinId && this.findGroup(this.recycleBinId)) {
      return { vault: this, recycleBinId: this.recycleBinId };
    }
    const bin = Group.create(RECYCLE_BIN_NAME);
    const rootWithBin = this.rootGroup.addGroup(bin);
    return {
      vault: this.with({ rootGroup: rootWithBin, recycleBinId: bin.id }),
      recycleBinId: bin.id,
    };
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

  private findDeletableGroup(groupId: GroupId): Group {
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
    return group;
  }

  /** Soft-deletes a group (with its full subtree) by moving it into the recycle bin. */
  deleteGroup(groupId: GroupId): Vault {
    const group = this.findDeletableGroup(groupId);
    const { vault, recycleBinId } = this.ensureRecycleBin();
    return vault.removeGroup(groupId).addGroup(recycleBinId, group);
  }

  /**
   * Ungroups a group: its direct entries and subgroups move up into its parent
   * group, and the now-empty group is soft-deleted into the recycle bin.
   */
  deleteGroupKeepingContents(groupId: GroupId): Vault {
    const group = this.findDeletableGroup(groupId);
    const { vault, recycleBinId } = this.ensureRecycleBin();
    const result = updateGroupContainingGroup(vault.rootGroup, groupId, (parent) => {
      let updated = parent.removeGroup(groupId);
      for (const child of group.groups) {
        updated = updated.addGroup(child);
      }
      for (const entry of group.entries) {
        updated = updated.addEntry(entry);
      }
      return updated;
    });
    return vault
      .with({ rootGroup: result.group })
      .addGroup(recycleBinId, new Group(group.id, group.name));
  }

  /**
   * Moves an entry into `targetGroupId`. Returns this vault unchanged when the
   * entry already lives directly in that group.
   */
  moveEntry(entryId: EntryId, targetGroupId: GroupId): Vault {
    const entry = this.findEntry(entryId);
    if (!entry) {
      throw new Error(`Entry not found: ${entryId.toString()}`);
    }
    const target = this.findGroup(targetGroupId);
    if (!target) {
      throw new Error(`Group not found: ${targetGroupId.toString()}`);
    }
    if (target.entries.some((candidate) => candidate.id.equals(entryId))) {
      return this;
    }
    return this.removeEntry(entryId).addEntry(targetGroupId, entry);
  }

  /** Moves a recycled entry back out of the recycle bin into `targetGroupId`. */
  restoreEntry(entryId: EntryId, targetGroupId: GroupId): Vault {
    return this.moveEntry(entryId, targetGroupId);
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

  /**
   * Reparents `groupId` to become the last child of `targetGroupId` (drag-and-drop
   * "drop into a folder"). Returns this vault unchanged when it's already a direct
   * child of that group.
   */
  moveGroupToParent(groupId: GroupId, targetGroupId: GroupId): Vault {
    const group = this.findGroup(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId.toString()}`);
    }
    const target = this.findGroup(targetGroupId);
    if (!target) {
      throw new Error(`Group not found: ${targetGroupId.toString()}`);
    }
    if (findGroupInTree(group, targetGroupId)) {
      throw new Error("Cannot move a group into itself or one of its own subgroups");
    }
    if (target.groups.some((child) => child.id.equals(groupId))) {
      return this;
    }
    return this.removeGroup(groupId).addGroup(targetGroupId, group);
  }

  /**
   * Reparents `groupId` into `targetParentId`, positioned immediately before
   * `beforeId` among its new siblings (or at the end when `beforeId` is
   * `undefined`) — drag-and-drop hovering a row's edge to both change a
   * group's nesting level and place it in one drop. Throws the same
   * cycle error as {@link moveGroupToParent} when the move would nest a
   * group inside itself or one of its own subgroups.
   */
  moveGroupToPosition(
    groupId: GroupId,
    targetParentId: GroupId,
    beforeId: GroupId | undefined,
  ): Vault {
    const moved = this.moveGroupToParent(groupId, targetParentId);
    if (beforeId === undefined) {
      return moved;
    }
    return moved.reorderGroup(groupId, beforeId);
  }

  /** Permanently deletes everything currently in the recycle bin, leaving it empty. */
  emptyRecycleBin(): Vault {
    if (!this.recycleBinId) {
      return this;
    }
    const result = updateGroupById(
      this.rootGroup,
      this.recycleBinId,
      (bin) => new Group(bin.id, bin.name, [], [], bin.icon),
    );
    if (!result.found) {
      return this;
    }
    return this.with({ rootGroup: result.group });
  }

  /** Entries that have an expiry date, leaving out those in the recycle bin. */
  entriesWithExpiry(): Entry[] {
    return collectEntriesWithExpiry(this.rootGroup, this.recycleBinId, []);
  }

  /** Entries whose expiry date `now` has reached, leaving out those in the recycle bin. */
  expiredEntries(now: Date): Entry[] {
    return this.entriesWithExpiry().filter((entry) => entry.isExpired(now));
  }

  /**
   * Deletes an entry outright, wherever it is, without it passing through the
   * recycle bin. Its history goes with it.
   */
  purgeEntry(entryId: EntryId): Vault {
    return this.removeEntry(entryId).with({ purgedEntryIds: [...this.purgedEntryIds, entryId] });
  }

  addCustomIcon(icon: CustomIcon): Vault {
    return this.with({ customIcons: this.customIcons.add(icon) });
  }

  /**
   * Deletes a custom icon from the vault. Entries and groups showing it go
   * back to the automatic icon; history revisions keep pointing at it, and
   * simply show the automatic icon too, since nothing can load it any more.
   */
  removeCustomIcon(id: string): Vault {
    if (!this.customIcons.has(id)) {
      throw new Error(`Custom icon not found: ${id}`);
    }
    return this.with({
      rootGroup: withoutIcon(this.rootGroup, Icon.custom(id)),
      customIcons: this.customIcons.remove(id),
    });
  }

  /** How many entries and groups (history aside) show custom icon `id`. */
  customIconUsage(id: string): number {
    return countIconUses(this.rootGroup, Icon.custom(id));
  }

  /**
   * Copies in the custom icons from `source` that this vault's entries and
   * groups (history included) refer to but it doesn't hold — what entries
   * merged in from another vault need to keep their images.
   */
  adoptCustomIcons(source: CustomIcons): Vault {
    let customIcons = this.customIcons;
    for (const id of referencedCustomIconIds(this.rootGroup)) {
      const icon = source.get(id);
      if (icon && !customIcons.has(id)) {
        customIcons = customIcons.add(icon);
      }
    }
    return customIcons === this.customIcons ? this : this.with({ customIcons });
  }
}
