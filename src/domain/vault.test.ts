import { describe, expect, it } from "vitest";
import { Entry } from "./entry";
import { EntryId } from "./entry-id";
import { Group } from "./group";
import { GroupId } from "./group-id";
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
});
