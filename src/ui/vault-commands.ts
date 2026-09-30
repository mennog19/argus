import { CustomIcon, Entry, EntryId, Group, GroupId, Icon, Vault } from "../domain";
import { GroupDeleteMode } from "../application/settings";

/** Every edit the vault screen can make, each applied to `vault` and then saved. */
export interface VaultCommands {
  createGroup(parentId: GroupId, name: string): Promise<void>;
  renameGroup(groupId: GroupId, name: string): Promise<void>;
  /** `added` is a just-uploaded image `icon` points at, saved along with the choice. */
  changeGroupIcon(groupId: GroupId, icon: Icon, added?: CustomIcon): Promise<void>;
  moveGroupToPosition(
    groupId: GroupId,
    targetParentId: GroupId,
    beforeId: GroupId | undefined,
  ): Promise<void>;
  moveGroupToParent(groupId: GroupId, targetGroupId: GroupId): Promise<void>;
  deleteGroup(groupId: GroupId, mode: GroupDeleteMode): Promise<void>;
  /** `added` is a just-uploaded image the entry's icon points at, saved along with it. */
  createEntry(entry: Entry, groupId: GroupId, added?: CustomIcon): Promise<void>;
  /** Saves `entry`'s edits and, when `targetGroupId` differs from where it lives now, moves it. */
  updateEntry(
    entry: Entry,
    targetGroupId: GroupId,
    currentGroupId: GroupId,
    added?: CustomIcon,
  ): Promise<void>;
  moveEntry(entryId: EntryId, groupId: GroupId): Promise<void>;
  deleteEntry(entryId: EntryId): Promise<void>;
  restoreEntry(entryId: EntryId): Promise<void>;
  /** Brings back `entry`'s history revision `index`; the version it replaces becomes a revision. */
  restoreEntryRevision(entry: Entry, index: number): Promise<void>;
  /** Removes `entry`'s history revision `index` from the file. */
  deleteEntryRevision(entry: Entry, index: number): Promise<void>;
  deleteEntryForever(entryId: EntryId): Promise<void>;
  restoreGroup(groupId: GroupId): Promise<void>;
  deleteGroupForever(groupId: GroupId): Promise<void>;
  emptyRecycleBin(): Promise<void>;
  /** Deletes a custom icon from the vault; whatever showed it goes back to automatic. */
  removeCustomIcon(id: string): Promise<void>;
}

export function vaultCommands(vault: Vault, save: (next: Vault) => Promise<void>): VaultCommands {
  // A drop onto where something already sits comes back as the same vault;
  // there's nothing to write, and re-encrypting the file for it is wasted work.
  async function saveIfChanged(next: Vault) {
    if (next !== vault) {
      await save(next);
    }
  }

  // An upload is saved together with the edit that uses it — never on its
  // own — so an abandoned choice leaves no unused image behind in the file.
  const withIcon = (added: CustomIcon | undefined) => (added ? vault.addCustomIcon(added) : vault);

  return {
    createGroup: (parentId, name) => save(vault.addGroup(parentId, Group.create(name))),
    renameGroup: (groupId, name) => save(vault.renameGroup(groupId, name)),
    changeGroupIcon: (groupId, icon, added) => save(withIcon(added).changeGroupIcon(groupId, icon)),
    moveGroupToPosition: (groupId, targetParentId, beforeId) =>
      saveIfChanged(vault.moveGroupToPosition(groupId, targetParentId, beforeId)),
    moveGroupToParent: (groupId, targetGroupId) =>
      saveIfChanged(vault.moveGroupToParent(groupId, targetGroupId)),
    deleteGroup: (groupId, mode) =>
      save(
        mode === "keepContents"
          ? vault.deleteGroupKeepingContents(groupId)
          : vault.deleteGroup(groupId),
      ),
    createEntry: (entry, groupId, added) => save(withIcon(added).addEntry(groupId, entry)),
    updateEntry: (entry, targetGroupId, currentGroupId, added) => {
      const updated = withIcon(added).updateEntry(entry);
      return save(
        currentGroupId.equals(targetGroupId)
          ? updated
          : updated.removeEntry(entry.id).addEntry(targetGroupId, entry),
      );
    },
    moveEntry: (entryId, groupId) => saveIfChanged(vault.moveEntry(entryId, groupId)),
    deleteEntry: (entryId) => save(vault.deleteEntry(entryId)),
    restoreEntry: (entryId) => save(vault.restoreEntry(entryId, vault.rootGroup.id)),
    restoreEntryRevision: (entry, index) => save(vault.updateEntry(entry.restoreRevision(index))),
    deleteEntryRevision: (entry, index) => save(vault.updateEntry(entry.deleteRevision(index))),
    deleteEntryForever: (entryId) => save(vault.removeEntry(entryId)),
    restoreGroup: (groupId) => save(vault.restoreGroup(groupId, vault.rootGroup.id)),
    deleteGroupForever: (groupId) => save(vault.removeGroup(groupId)),
    emptyRecycleBin: () => save(vault.emptyRecycleBin()),
    removeCustomIcon: (id) => save(vault.removeCustomIcon(id)),
  };
}
