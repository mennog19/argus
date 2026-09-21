import { describe, expect, it } from "vitest";
import { Entry } from "./entry";
import { EntryId } from "./entry-id";
import { Group } from "./group";
import { GroupId } from "./group-id";
import { Icon } from "./icon";
import { Vault } from "./vault";

describe("Vault", () => {
  it("creates a vault with an empty root group named after it", () => {
    const vault = Vault.create("My Vault");

    expect(vault.name).toBe("My Vault");
    expect(vault.rootGroup.name).toBe("My Vault");
    expect(vault.rootGroup.groups).toEqual([]);
    expect(vault.rootGroup.entries).toEqual([]);
  });

  describe("findGroup", () => {
    it("finds the root group by id", () => {
      const vault = Vault.create("Root");

      expect(vault.findGroup(vault.rootGroup.id)?.equals(vault.rootGroup)).toBe(true);
    });

    it("finds a group nested two levels deep", () => {
      const grandchild = Group.create("Grandchild");
      const child = Group.create("Child").addGroup(grandchild);
      const vault = new Vault("Root", Group.create("Root").addGroup(child));

      expect(vault.findGroup(grandchild.id)?.equals(grandchild)).toBe(true);
    });

    it("returns undefined when the group id doesn't exist", () => {
      const vault = Vault.create("Root");

      expect(vault.findGroup(GroupId.create())).toBeUndefined();
    });

    it("finds a group among several siblings, not just the first", () => {
      const target = Group.create("Target");
      const vault = new Vault(
        "Root",
        Group.create("Root").addGroup(Group.create("First")).addGroup(target),
      );

      expect(vault.findGroup(target.id)?.equals(target)).toBe(true);
    });
  });

  describe("findEntry", () => {
    it("finds an entry directly in the root group", () => {
      const entry = Entry.create({ title: "Bank" });
      const vault = new Vault("Root", Group.create("Root").addEntry(entry));

      expect(vault.findEntry(entry.id)?.equals(entry)).toBe(true);
    });

    it("finds an entry nested inside a sub-group", () => {
      const entry = Entry.create({ title: "Bank" });
      const child = Group.create("Child").addEntry(entry);
      const vault = new Vault("Root", Group.create("Root").addGroup(child));

      expect(vault.findEntry(entry.id)?.equals(entry)).toBe(true);
    });

    it("returns undefined when the entry id doesn't exist", () => {
      const vault = Vault.create("Root");

      expect(vault.findEntry(EntryId.create())).toBeUndefined();
    });
  });

  describe("addGroup", () => {
    it("adds a group under the root", () => {
      const vault = Vault.create("Root");
      const child = Group.create("Child");

      const updated = vault.addGroup(vault.rootGroup.id, child);

      expect(vault.rootGroup.groups).toEqual([]);
      expect(updated.rootGroup.groups.map((g) => g.name)).toEqual(["Child"]);
    });

    it("adds a group under a nested parent", () => {
      const child = Group.create("Child");
      const vault = new Vault("Root", Group.create("Root").addGroup(child));
      const grandchild = Group.create("Grandchild");

      const updated = vault.addGroup(child.id, grandchild);

      expect(updated.findGroup(grandchild.id)?.equals(grandchild)).toBe(true);
    });

    it("throws when the parent group doesn't exist", () => {
      const vault = Vault.create("Root");

      expect(() => vault.addGroup(GroupId.create(), Group.create("Orphan"))).toThrow(
        "Group not found",
      );
    });
  });

  describe("removeGroup", () => {
    it("removes a direct child of the root", () => {
      const child = Group.create("Child");
      const vault = new Vault("Root", Group.create("Root").addGroup(child));

      const updated = vault.removeGroup(child.id);

      expect(updated.rootGroup.groups).toEqual([]);
    });

    it("removes a group nested two levels deep", () => {
      const grandchild = Group.create("Grandchild");
      const child = Group.create("Child").addGroup(grandchild);
      const vault = new Vault("Root", Group.create("Root").addGroup(child));

      const updated = vault.removeGroup(grandchild.id);

      expect(updated.findGroup(grandchild.id)).toBeUndefined();
      expect(updated.findGroup(child.id)).toBeDefined();
    });

    it("refuses to remove the root group", () => {
      const vault = Vault.create("Root");

      expect(() => vault.removeGroup(vault.rootGroup.id)).toThrow("Cannot remove the root group");
    });

    it("throws when the group doesn't exist, even alongside other groups", () => {
      const vault = new Vault("Root", Group.create("Root").addGroup(Group.create("Sibling")));

      expect(() => vault.removeGroup(GroupId.create())).toThrow("Group not found");
    });
  });

  describe("renameGroup", () => {
    it("renames the root group", () => {
      const vault = Vault.create("Root");

      const updated = vault.renameGroup(vault.rootGroup.id, "Renamed");

      expect(updated.rootGroup.name).toBe("Renamed");
    });

    it("renames a nested group", () => {
      const child = Group.create("Child");
      const vault = new Vault("Root", Group.create("Root").addGroup(child));

      const updated = vault.renameGroup(child.id, "Renamed");

      expect(updated.findGroup(child.id)?.name).toBe("Renamed");
    });

    it("throws when the group doesn't exist", () => {
      const vault = Vault.create("Root");

      expect(() => vault.renameGroup(GroupId.create(), "Renamed")).toThrow("Group not found");
    });
  });

  describe("changeGroupIcon", () => {
    it("changes a nested group's icon", () => {
      const child = Group.create("Child");
      const vault = new Vault("Root", Group.create("Root").addGroup(child));

      const updated = vault.changeGroupIcon(child.id, Icon.library("star"));

      expect(updated.findGroup(child.id)?.icon.equals(Icon.library("star"))).toBe(true);
    });

    it("throws when the group doesn't exist", () => {
      const vault = Vault.create("Root");

      expect(() => vault.changeGroupIcon(GroupId.create(), Icon.library("star"))).toThrow(
        "Group not found",
      );
    });
  });

  describe("addEntry", () => {
    it("adds an entry to the root group", () => {
      const vault = Vault.create("Root");
      const entry = Entry.create({ title: "Bank" });

      const updated = vault.addEntry(vault.rootGroup.id, entry);

      expect(vault.rootGroup.entries).toEqual([]);
      expect(updated.rootGroup.entries.map((e) => e.title)).toEqual(["Bank"]);
    });

    it("adds an entry to a nested group", () => {
      const child = Group.create("Child");
      const vault = new Vault("Root", Group.create("Root").addGroup(child));
      const entry = Entry.create({ title: "Bank" });

      const updated = vault.addEntry(child.id, entry);

      expect(updated.findEntry(entry.id)?.equals(entry)).toBe(true);
    });

    it("throws when the target group doesn't exist", () => {
      const vault = Vault.create("Root");

      expect(() => vault.addEntry(GroupId.create(), Entry.create())).toThrow("Group not found");
    });
  });

  describe("updateEntry", () => {
    it("updates an entry stored in the root group", () => {
      const entry = Entry.create({ title: "Old" });
      const vault = new Vault("Root", Group.create("Root").addEntry(entry));

      const updated = vault.updateEntry(entry.update({ title: "New" }));

      expect(updated.findEntry(entry.id)?.title).toBe("New");
    });

    it("updates an entry stored in a nested group", () => {
      const entry = Entry.create({ title: "Old" });
      const child = Group.create("Child").addEntry(entry);
      const vault = new Vault("Root", Group.create("Root").addGroup(child));

      const updated = vault.updateEntry(entry.update({ title: "New" }));

      expect(updated.findEntry(entry.id)?.title).toBe("New");
    });

    it("throws when the entry doesn't exist", () => {
      const vault = Vault.create("Root");

      expect(() => vault.updateEntry(Entry.create())).toThrow("Entry not found");
    });
  });

  describe("removeEntry", () => {
    it("removes an entry stored in the root group", () => {
      const entry = Entry.create({ title: "Bank" });
      const vault = new Vault("Root", Group.create("Root").addEntry(entry));

      const updated = vault.removeEntry(entry.id);

      expect(updated.findEntry(entry.id)).toBeUndefined();
    });

    it("removes an entry stored in a nested group", () => {
      const entry = Entry.create({ title: "Bank" });
      const child = Group.create("Child").addEntry(entry);
      const vault = new Vault("Root", Group.create("Root").addGroup(child));

      const updated = vault.removeEntry(entry.id);

      expect(updated.findEntry(entry.id)).toBeUndefined();
    });

    it("throws when the entry doesn't exist", () => {
      const vault = Vault.create("Root");

      expect(() => vault.removeEntry(EntryId.create())).toThrow("Entry not found");
    });
  });

  describe("recycle bin", () => {
    describe("deleteEntry", () => {
      it("lazily creates a recycle bin and moves the entry into it", () => {
        const entry = Entry.create({ title: "Bank" });
        const vault = new Vault("Root", Group.create("Root").addEntry(entry));

        const updated = vault.deleteEntry(entry.id);

        expect(updated.rootGroup.entries).toEqual([]);
        expect(updated.recycleBinId).toBeDefined();
        expect(updated.recycleBin?.name).toBe("Recycle Bin");
        expect(updated.recycleBin?.entries.map((e) => e.id.toString())).toEqual([
          entry.id.toString(),
        ]);
      });

      it("reuses an existing recycle bin instead of creating a second one", () => {
        const first = Entry.create({ title: "First" });
        const second = Entry.create({ title: "Second" });
        let vault = new Vault("Root", Group.create("Root").addEntry(first).addEntry(second));

        vault = vault.deleteEntry(first.id);
        const binId = vault.recycleBinId;
        vault = vault.deleteEntry(second.id);

        expect(vault.recycleBinId?.equals(binId!)).toBe(true);
        expect(vault.rootGroup.groups.filter((g) => g.name === "Recycle Bin")).toHaveLength(1);
        expect(vault.recycleBin?.entries.map((e) => e.id.toString()).sort()).toEqual(
          [first.id.toString(), second.id.toString()].sort(),
        );
      });

      it("recreates the recycle bin if the tracked id no longer resolves to a group", () => {
        const entry = Entry.create({ title: "Bank" });
        const vault = new Vault("Root", Group.create("Root").addEntry(entry), GroupId.create());

        const updated = vault.deleteEntry(entry.id);

        expect(updated.recycleBin?.entries.map((e) => e.id.toString())).toEqual([
          entry.id.toString(),
        ]);
      });

      it("throws when the entry doesn't exist", () => {
        const vault = Vault.create("Root");

        expect(() => vault.deleteEntry(EntryId.create())).toThrow("Entry not found");
      });
    });

    describe("deleteGroup", () => {
      it("moves a group and its subtree into the recycle bin", () => {
        const nestedEntry = Entry.create({ title: "Nested" });
        const child = Group.create("Child").addEntry(nestedEntry);
        const parent = Group.create("Parent").addGroup(child);
        const vault = new Vault("Root", Group.create("Root").addGroup(parent));

        const updated = vault.deleteGroup(parent.id);

        expect(updated.rootGroup.groups.map((g) => g.name)).toEqual(["Recycle Bin"]);
        const recycledParent = updated.recycleBin?.groups.find((g) => g.name === "Parent");
        expect(
          recycledParent?.groups.find((g) => g.name === "Child")?.entries[0].id.toString(),
        ).toBe(nestedEntry.id.toString());
      });

      it("throws when trying to remove the root group", () => {
        const vault = Vault.create("Root");

        expect(() => vault.deleteGroup(vault.rootGroup.id)).toThrow("Cannot remove the root group");
      });

      it("throws when trying to delete the recycle bin itself", () => {
        const entry = Entry.create({ title: "Bank" });
        let vault = new Vault("Root", Group.create("Root").addEntry(entry));
        vault = vault.deleteEntry(entry.id);

        expect(() => vault.deleteGroup(vault.recycleBinId!)).toThrow(
          "Cannot delete the recycle bin",
        );
      });

      it("throws when the group doesn't exist", () => {
        const vault = Vault.create("Root");

        expect(() => vault.deleteGroup(GroupId.create())).toThrow("Group not found");
      });
    });

    describe("deleteGroupKeepingContents", () => {
      it("moves the group's entries and subgroups into its parent and recycles the empty group", () => {
        const directEntry = Entry.create({ title: "Direct" });
        const nestedEntry = Entry.create({ title: "Nested" });
        const child = Group.create("Child").addEntry(nestedEntry);
        const target = Group.create("Target").addGroup(child).addEntry(directEntry);
        const siblingEntry = Entry.create({ title: "Sibling" });
        const parent = Group.create("Parent").addGroup(target).addEntry(siblingEntry);
        const vault = new Vault("Root", Group.create("Root").addGroup(parent));

        const updated = vault.deleteGroupKeepingContents(target.id);

        const updatedParent = updated.findGroup(parent.id)!;
        expect(updatedParent.groups.map((g) => g.name)).toEqual(["Child"]);
        expect(updatedParent.entries.map((e) => e.title)).toEqual(["Sibling", "Direct"]);
        expect(updatedParent.groups[0].entries[0].id.equals(nestedEntry.id)).toBe(true);
        const recycled = updated.recycleBin!.groups;
        expect(recycled).toHaveLength(1);
        expect(recycled[0].id.equals(target.id)).toBe(true);
        expect(recycled[0].groups).toEqual([]);
        expect(recycled[0].entries).toEqual([]);
      });

      it("reuses an existing recycle bin", () => {
        const entry = Entry.create({ title: "Bank" });
        const target = Group.create("Target");
        let vault = new Vault("Root", Group.create("Root").addEntry(entry).addGroup(target));
        vault = vault.deleteEntry(entry.id);

        const updated = vault.deleteGroupKeepingContents(target.id);

        expect(updated.recycleBinId).toEqual(vault.recycleBinId);
        expect(updated.recycleBin!.entries.map((e) => e.title)).toEqual(["Bank"]);
        expect(updated.recycleBin!.groups.map((g) => g.name)).toEqual(["Target"]);
      });

      it("throws when trying to remove the root group", () => {
        const vault = Vault.create("Root");

        expect(() => vault.deleteGroupKeepingContents(vault.rootGroup.id)).toThrow(
          "Cannot remove the root group",
        );
      });

      it("throws when trying to delete the recycle bin itself", () => {
        const entry = Entry.create({ title: "Bank" });
        let vault = new Vault("Root", Group.create("Root").addEntry(entry));
        vault = vault.deleteEntry(entry.id);

        expect(() => vault.deleteGroupKeepingContents(vault.recycleBinId!)).toThrow(
          "Cannot delete the recycle bin",
        );
      });

      it("throws when the group doesn't exist", () => {
        const vault = Vault.create("Root");

        expect(() => vault.deleteGroupKeepingContents(GroupId.create())).toThrow("Group not found");
      });
    });

    describe("moveEntry", () => {
      it("moves an entry from its current group into the target group", () => {
        const entry = Entry.create({ title: "Bank" });
        const work = Group.create("Work");
        const vault = new Vault("Root", Group.create("Root").addEntry(entry).addGroup(work));

        const moved = vault.moveEntry(entry.id, work.id);

        expect(moved.rootGroup.entries).toEqual([]);
        expect(moved.findGroup(work.id)?.entries.map((e) => e.id.toString())).toEqual([
          entry.id.toString(),
        ]);
      });

      it("returns the same vault when the entry is already in the target group", () => {
        const entry = Entry.create({ title: "Bank" });
        const vault = new Vault("Root", Group.create("Root").addEntry(entry));

        expect(vault.moveEntry(entry.id, vault.rootGroup.id)).toBe(vault);
      });

      it("throws when the entry doesn't exist", () => {
        const vault = Vault.create("Root");

        expect(() => vault.moveEntry(EntryId.create(), vault.rootGroup.id)).toThrow(
          "Entry not found",
        );
      });

      it("throws when the target group doesn't exist, leaving the entry in place", () => {
        const entry = Entry.create({ title: "Bank" });
        const vault = new Vault("Root", Group.create("Root").addEntry(entry));

        expect(() => vault.moveEntry(entry.id, GroupId.create())).toThrow("Group not found");
        expect(vault.findEntry(entry.id)).toBe(entry);
      });
    });

    describe("restoreEntry", () => {
      it("moves an entry out of the recycle bin into the target group", () => {
        const entry = Entry.create({ title: "Bank" });
        const work = Group.create("Work");
        let vault = new Vault("Root", Group.create("Root").addEntry(entry).addGroup(work));
        vault = vault.deleteEntry(entry.id);

        const restored = vault.restoreEntry(entry.id, work.id);

        expect(restored.recycleBin?.entries).toEqual([]);
        expect(restored.findGroup(work.id)?.entries.map((e) => e.id.toString())).toEqual([
          entry.id.toString(),
        ]);
      });

      it("throws when the entry doesn't exist", () => {
        const vault = Vault.create("Root");

        expect(() => vault.restoreEntry(EntryId.create(), vault.rootGroup.id)).toThrow(
          "Entry not found",
        );
      });

      it("throws when the target group doesn't exist", () => {
        const entry = Entry.create({ title: "Bank" });
        let vault = new Vault("Root", Group.create("Root").addEntry(entry));
        vault = vault.deleteEntry(entry.id);

        expect(() => vault.restoreEntry(entry.id, GroupId.create())).toThrow("Group not found");
      });
    });

    describe("restoreGroup", () => {
      it("moves a group out of the recycle bin into the target group", () => {
        const deleted = Group.create("Deleted");
        const work = Group.create("Work");
        let vault = new Vault("Root", Group.create("Root").addGroup(deleted).addGroup(work));
        vault = vault.deleteGroup(deleted.id);

        const restored = vault.restoreGroup(deleted.id, work.id);

        expect(restored.recycleBin?.groups).toEqual([]);
        expect(restored.findGroup(work.id)?.groups.map((g) => g.name)).toEqual(["Deleted"]);
      });

      it("throws when the group doesn't exist", () => {
        const vault = Vault.create("Root");

        expect(() => vault.restoreGroup(GroupId.create(), vault.rootGroup.id)).toThrow(
          "Group not found",
        );
      });

      it("throws when restoring a group into itself", () => {
        const deleted = Group.create("Deleted");
        let vault = new Vault("Root", Group.create("Root").addGroup(deleted));
        vault = vault.deleteGroup(deleted.id);

        expect(() => vault.restoreGroup(deleted.id, deleted.id)).toThrow(
          "Cannot restore a group into itself or one of its own subgroups",
        );
      });

      it("throws when restoring a group into its own subgroup", () => {
        const grandchild = Group.create("Grandchild");
        const deleted = Group.create("Deleted").addGroup(grandchild);
        let vault = new Vault("Root", Group.create("Root").addGroup(deleted));
        vault = vault.deleteGroup(deleted.id);
        const recycledDeleted = vault.recycleBin!.groups.find((g) => g.name === "Deleted")!;
        const recycledGrandchild = recycledDeleted.groups[0];

        expect(() => vault.restoreGroup(recycledDeleted.id, recycledGrandchild.id)).toThrow(
          "Cannot restore a group into itself or one of its own subgroups",
        );
      });
    });

    describe("emptyRecycleBin", () => {
      it("removes everything from the recycle bin, keeping the (now empty) bin itself", () => {
        const entry = Entry.create({ title: "Bank" });
        const deletedGroup = Group.create("Deleted");
        let vault = new Vault("Root", Group.create("Root").addEntry(entry).addGroup(deletedGroup));
        vault = vault.deleteEntry(entry.id);
        vault = vault.deleteGroup(deletedGroup.id);

        const emptied = vault.emptyRecycleBin();

        expect(emptied.recycleBin?.entries).toEqual([]);
        expect(emptied.recycleBin?.groups).toEqual([]);
        expect(emptied.recycleBinId?.equals(vault.recycleBinId!)).toBe(true);
      });

      it("returns the same vault when there is no recycle bin yet", () => {
        const vault = Vault.create("Root");

        expect(vault.emptyRecycleBin()).toBe(vault);
      });

      it("returns the same vault when the tracked recycle bin id no longer resolves", () => {
        const vault = new Vault("Root", Group.create("Root"), GroupId.create());

        expect(vault.emptyRecycleBin()).toBe(vault);
      });
    });

    describe("isInRecycleBin", () => {
      it("is false when there is no recycle bin", () => {
        const vault = Vault.create("Root");

        expect(vault.isInRecycleBin(vault.rootGroup.id)).toBe(false);
      });

      it("is true for the recycle bin group itself and anything nested inside it", () => {
        const entry = Entry.create({ title: "Bank" });
        let vault = new Vault("Root", Group.create("Root").addEntry(entry));
        vault = vault.deleteEntry(entry.id);

        expect(vault.isInRecycleBin(vault.recycleBinId!)).toBe(true);
      });

      it("is false for a group outside the recycle bin", () => {
        const entry = Entry.create({ title: "Bank" });
        const work = Group.create("Work");
        let vault = new Vault("Root", Group.create("Root").addEntry(entry).addGroup(work));
        vault = vault.deleteEntry(entry.id);

        expect(vault.isInRecycleBin(work.id)).toBe(false);
      });
    });

    describe("recycleBin getter", () => {
      it("is undefined when no recycle bin has been created", () => {
        const vault = Vault.create("Root");

        expect(vault.recycleBin).toBeUndefined();
      });
    });
  });
});
