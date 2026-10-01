import { describe, expect, it, Mock, vi } from "vitest";
import { Attachment, Attachments, CustomIcon, Entry, Group, Icon, Vault } from "../../src/domain";
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

  describe("attachments", () => {
    const notes = new Attachment("notes.txt", new Uint8Array([1]));

    function setupWithAttachment() {
      const base = setup();
      const entry = base.entry.update({ attachments: new Attachments([notes]) });
      const vault = base.vault.updateEntry(entry);
      return { entry, save: base.save, commands: vaultCommands(vault, base.save) };
    }

    it("attaches files to an entry, renaming one whose name is taken", async () => {
      const { entry, save, commands } = setupWithAttachment();

      await commands.addAttachments(entry, [
        new Attachment("photo.png", new Uint8Array([2])),
        new Attachment("notes.txt", new Uint8Array([3])),
      ]);

      const attachments = saved(save).findEntry(entry.id)!.attachments;
      expect(attachments.values.map((attachment) => attachment.name)).toEqual([
        "notes.txt",
        "photo.png",
        "notes (2).txt",
      ]);
      expect(attachments.get("notes.txt")).toBe(notes);
    });

    it("renames an attachment", async () => {
      const { entry, save, commands } = setupWithAttachment();

      await commands.renameAttachment(entry, "notes.txt", "todo.txt");

      expect(saved(save).findEntry(entry.id)!.attachments.get("todo.txt")?.data).toBe(notes.data);
    });

    it("saves nothing when the new name is refused", () => {
      const { entry, save, commands } = setupWithAttachment();

      expect(() => commands.renameAttachment(entry, "notes.txt", " ")).toThrow(
        "An attachment needs a name.",
      );
      expect(save).not.toHaveBeenCalled();
    });

    it("removes an attachment", async () => {
      const { entry, save, commands } = setupWithAttachment();

      await commands.removeAttachment(entry, "notes.txt");

      expect(saved(save).findEntry(entry.id)!.attachments.size).toBe(0);
    });
  });

  describe("custom icons", () => {
    const upload = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000abcd", new Uint8Array([1]));
    const icon = Icon.custom(upload.id);

    it("saves an uploaded image together with the group using it", async () => {
      const { work, save, commands } = setup();
      await commands.changeGroupIcon(work.id, icon, upload);
      const next = saved(save);
      expect(next.customIcons.get(upload.id)).toBe(upload);
      expect(next.findGroup(work.id)?.icon).toBe(icon);
    });

    it("saves an uploaded image together with a new or edited entry", async () => {
      const { entry, work, home, save, commands } = setup();
      const created = Entry.create({ title: "Mail", icon });
      await commands.createEntry(created, home.id, upload);
      expect(saved(save).customIcons.has(upload.id)).toBe(true);

      save.mockClear();
      await commands.updateEntry(entry.update({ icon }), home.id, work.id, upload);
      const next = saved(save);
      expect(next.customIcons.has(upload.id)).toBe(true);
      expect(next.findGroup(home.id)?.entries[0].icon).toBe(icon);
    });

    it("deletes an icon from the vault", async () => {
      const { vault, save } = setup();
      const commands = vaultCommands(vault.addCustomIcon(upload), save);
      await commands.removeCustomIcon(upload.id);
      expect(saved(save).customIcons.size).toBe(0);
    });
  });
});
