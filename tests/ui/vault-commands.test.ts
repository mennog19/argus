import { describe, expect, it, Mock, vi } from "vitest";
import { Entry, Group, Icon, Vault } from "../../src/domain";
import { vaultCommands } from "../../src/ui/vault-commands";

function setup() {
  const entry = Entry.create({ title: "Bank", username: "alice" });
  const work = Group.create("Work").addEntry(entry);
  const home = Group.create("Home");
  const vault = new Vault("Mine", Group.create("Mine").addGroup(work).addGroup(home));
  const save: Mock<(next: Vault) => Promise<void>> = vi.fn().mockResolvedValue(undefined);
  return { vault, entry, work, home, save, commands: vaultCommands(vault, save) };
}

function saved(save: Mock<(next: Vault) => Promise<void>>): Vault {
  expect(save).toHaveBeenCalledTimes(1);
  return save.mock.calls[0][0];
}

describe("vaultCommands", () => {
  it("creates a named group under the parent", async () => {
    const { vault, save, commands } = setup();
    await commands.createGroup(vault.rootGroup.id, "Travel");
    expect(saved(save).rootGroup.groups.map((group) => group.name)).toContain("Travel");
  });

  it("renames a group and changes its icon", async () => {
    const { work, save, commands } = setup();
    await commands.renameGroup(work.id, "Office");
    expect(saved(save).findGroup(work.id)?.name).toBe("Office");

    save.mockClear();
    const icon = Icon.library("key");
    await commands.changeGroupIcon(work.id, icon);
    expect(saved(save).findGroup(work.id)?.icon).toEqual(icon);
  });

  describe("moves", () => {
    it("saves a group moved somewhere new", async () => {
      const { work, home, save, commands } = setup();
      await commands.moveGroupToParent(work.id, home.id);
      expect(
        saved(save)
          .findGroup(home.id)
          ?.groups.map((group) => group.id),
      ).toEqual([work.id]);
    });

    it("saves a group repositioned among its siblings", async () => {
      const { vault, work, home, save, commands } = setup();
      await commands.moveGroupToPosition(home.id, vault.rootGroup.id, work.id);
      expect(saved(save).rootGroup.groups.map((group) => group.name)).toEqual(["Home", "Work"]);
    });

    it("skips the save when a group or entry is dropped where it already is", async () => {
      const { vault, entry, work, save, commands } = setup();
      await commands.moveGroupToParent(work.id, vault.rootGroup.id);
      await commands.moveGroupToPosition(work.id, vault.rootGroup.id, undefined);
      await commands.moveEntry(entry.id, work.id);
      expect(save).not.toHaveBeenCalled();
    });

    it("saves an entry moved into another group", async () => {
      const { entry, home, save, commands } = setup();
      await commands.moveEntry(entry.id, home.id);
      expect(
        saved(save)
          .findGroup(home.id)
          ?.entries.map((e) => e.id),
      ).toEqual([entry.id]);
    });
  });

  describe("deleteGroup", () => {
    it("moves the group and its contents to the recycle bin", async () => {
      const { entry, work, save, commands } = setup();
      await commands.deleteGroup(work.id, "deleteContents");
      const next = saved(save);
      expect(next.isInRecycleBin(work.id)).toBe(true);
      expect(next.findGroup(work.id)?.entries.map((e) => e.id)).toEqual([entry.id]);
    });

    it("keeps the contents in the parent when asked to", async () => {
      const { entry, work, save, commands } = setup();
      await commands.deleteGroup(work.id, "keepContents");
      const next = saved(save);
      expect(next.rootGroup.entries.map((e) => e.id)).toEqual([entry.id]);
      expect(next.isInRecycleBin(work.id)).toBe(true);
    });
  });

  describe("entries", () => {
    it("creates an entry in the chosen group", async () => {
      const { home, save, commands } = setup();
      const created = Entry.create({ title: "Mail" });
      await commands.createEntry(created, home.id);
      expect(
        saved(save)
          .findGroup(home.id)
          ?.entries.map((e) => e.id),
      ).toEqual([created.id]);
    });

    it("updates an entry in place when its group is unchanged", async () => {
      const { entry, work, save, commands } = setup();
      await commands.updateEntry(entry.update({ title: "Bank 2" }), work.id, work.id);
      expect(saved(save).findGroup(work.id)?.entries[0].title).toBe("Bank 2");
    });

    it("moves an updated entry when its group changed", async () => {
      const { entry, work, home, save, commands } = setup();
      await commands.updateEntry(entry.update({ title: "Bank 2" }), home.id, work.id);
      const next = saved(save);
      expect(next.findGroup(work.id)?.entries).toEqual([]);
      expect(next.findGroup(home.id)?.entries[0].title).toBe("Bank 2");
    });
  });

  describe("recycle bin", () => {
    it("soft-deletes an entry, then restores it to the root group", async () => {
      const { vault, entry, save } = setup();
      await vaultCommands(vault, save).deleteEntry(entry.id);
      const deleted = saved(save);
      expect(deleted.recycleBin?.entries.map((e) => e.id)).toEqual([entry.id]);

      save.mockClear();
      await vaultCommands(deleted, save).restoreEntry(entry.id);
      expect(saved(save).rootGroup.entries.map((e) => e.id)).toEqual([entry.id]);
    });

    it("restores a group to the root group", async () => {
      const { vault, work, save } = setup();
      await vaultCommands(vault, save).deleteGroup(work.id, "deleteContents");
      const deleted = saved(save);

      save.mockClear();
      await vaultCommands(deleted, save).restoreGroup(work.id);
      expect(saved(save).isInRecycleBin(work.id)).toBe(false);
    });

    it("restores or deletes one of an entry's history revisions", async () => {
      const { vault, entry, save } = setup();
      const revision = entry.update({ username: "old-alice" });
      const withHistory = entry.update({ history: [revision] });
      const current = vault.updateEntry(withHistory);

      await vaultCommands(current, save).restoreEntryRevision(withHistory, 0);
      expect(saved(save).findEntry(entry.id)?.username).toBe("old-alice");

      save.mockClear();
      await vaultCommands(current, save).deleteEntryRevision(withHistory, 0);
      expect(saved(save).findEntry(entry.id)?.history).toEqual([]);
    });

    it("deletes entries and groups for good, or empties the whole bin", async () => {
      const { vault, entry, work, home, save } = setup();
      await vaultCommands(vault, save).deleteEntryForever(entry.id);
      expect(saved(save).findEntry(entry.id)).toBeUndefined();

      save.mockClear();
      await vaultCommands(vault, save).deleteGroupForever(home.id);
      expect(saved(save).findGroup(home.id)).toBeUndefined();

      save.mockClear();
      const binned = vault.deleteGroup(work.id);
      await vaultCommands(binned, save).emptyRecycleBin();
      expect(saved(save).recycleBin?.groups).toEqual([]);
    });
  });
});
