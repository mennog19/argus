import { describe, expect, it } from "vitest";
import { Entry } from "../../src/domain/entry";
import { Group } from "../../src/domain/group";
import { GroupId } from "../../src/domain/group-id";
import { Icon } from "../../src/domain/icon";

describe("Group", () => {
  it("creates an empty named group with a fresh id", () => {
    const group = Group.create("Passwords");

    expect(group.id).toBeInstanceOf(GroupId);
    expect(group.name).toBe("Passwords");
    expect(group.groups).toEqual([]);
    expect(group.entries).toEqual([]);
    expect(group.icon).toBe(Icon.AUTO);
  });

  it("changeIcon returns a new group with the new icon, preserving identity", () => {
    const original = Group.create("Old");
    const recolored = original.changeIcon(Icon.library("star"));

    expect(recolored).not.toBe(original);
    expect(recolored.id.equals(original.id)).toBe(true);
    expect(recolored.icon.equals(Icon.library("star"))).toBe(true);
    expect(original.icon).toBe(Icon.AUTO);
  });

  it("mutations preserve the group's icon", () => {
    const withIcon = Group.create("Root").changeIcon(Icon.brand("github"));
    const entry = Entry.create({ title: "Bank" });
    const child = Group.create("Child");

    expect(withIcon.rename("New").icon.equals(Icon.brand("github"))).toBe(true);
    expect(withIcon.addEntry(entry).icon.equals(Icon.brand("github"))).toBe(true);
    expect(withIcon.addGroup(child).icon.equals(Icon.brand("github"))).toBe(true);
  });

  it("two groups with the same id are equal regardless of other fields", () => {
    const id = GroupId.create();
    const a = new Group(id, "A");
    const b = new Group(id, "B");

    expect(a.equals(b)).toBe(true);
  });

  it("two groups with different ids are not equal", () => {
    expect(Group.create("A").equals(Group.create("B"))).toBe(false);
  });

  it("rename returns a new group with the new name, preserving identity", () => {
    const original = Group.create("Old");
    const renamed = original.rename("New");

    expect(renamed).not.toBe(original);
    expect(renamed.id.equals(original.id)).toBe(true);
    expect(renamed.name).toBe("New");
    expect(original.name).toBe("Old");
  });

  it("addEntry returns a new group with the entry appended", () => {
    const original = Group.create("Root");
    const entry = Entry.create({ title: "Bank" });
    const updated = original.addEntry(entry);

    expect(original.entries).toEqual([]);
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].equals(entry)).toBe(true);
  });

  it("replaceEntry swaps the entry with the matching id", () => {
    const entry = Entry.create({ title: "Old" });
    const group = Group.create("Root").addEntry(entry);
    const updatedEntry = entry.update({ title: "New" });

    const updated = group.replaceEntry(updatedEntry);

    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].title).toBe("New");
  });

  it("replaceEntry leaves non-matching entries untouched", () => {
    const other = Entry.create({ title: "Other" });
    const group = Group.create("Root").addEntry(other);

    const updated = group.replaceEntry(Entry.create({ title: "Unrelated" }));

    expect(updated.entries).toEqual([other]);
  });

  it("removeEntry drops the entry with the matching id", () => {
    const entry = Entry.create({ title: "Bank" });
    const group = Group.create("Root").addEntry(entry);

    const updated = group.removeEntry(entry.id);

    expect(group.entries).toHaveLength(1);
    expect(updated.entries).toEqual([]);
  });

  it("addGroup returns a new group with the child appended", () => {
    const parent = Group.create("Root");
    const child = Group.create("Child");
    const updated = parent.addGroup(child);

    expect(parent.groups).toEqual([]);
    expect(updated.groups).toHaveLength(1);
    expect(updated.groups[0].equals(child)).toBe(true);
  });

  it("replaceGroup swaps the child group with the matching id", () => {
    const child = Group.create("Old");
    const parent = Group.create("Root").addGroup(child);
    const renamedChild = child.rename("New");

    const updated = parent.replaceGroup(renamedChild);

    expect(updated.groups).toHaveLength(1);
    expect(updated.groups[0].name).toBe("New");
  });

  it("replaceGroup leaves non-matching child groups untouched", () => {
    const other = Group.create("Other");
    const parent = Group.create("Root").addGroup(other);

    const updated = parent.replaceGroup(Group.create("Unrelated"));

    expect(updated.groups).toEqual([other]);
  });

  it("removeGroup drops the child group with the matching id", () => {
    const child = Group.create("Child");
    const parent = Group.create("Root").addGroup(child);

    const updated = parent.removeGroup(child.id);

    expect(parent.groups).toHaveLength(1);
    expect(updated.groups).toEqual([]);
  });

  it("moveGroupBefore moves a child to the front", () => {
    const a = Group.create("A");
    const b = Group.create("B");
    const c = Group.create("C");
    const parent = Group.create("Root").addGroup(a).addGroup(b).addGroup(c);

    const updated = parent.moveGroupBefore(c.id, a.id);

    expect(updated.groups.map((g) => g.name)).toEqual(["C", "A", "B"]);
    expect(parent.groups.map((g) => g.name)).toEqual(["A", "B", "C"]);
  });

  it("moveGroupBefore moves a child to the end when beforeId is undefined", () => {
    const a = Group.create("A");
    const b = Group.create("B");
    const c = Group.create("C");
    const parent = Group.create("Root").addGroup(a).addGroup(b).addGroup(c);

    const updated = parent.moveGroupBefore(a.id, undefined);

    expect(updated.groups.map((g) => g.name)).toEqual(["B", "C", "A"]);
  });

  it("moveGroupBefore moves a child between two others", () => {
    const a = Group.create("A");
    const b = Group.create("B");
    const c = Group.create("C");
    const parent = Group.create("Root").addGroup(a).addGroup(b).addGroup(c);

    const updated = parent.moveGroupBefore(a.id, c.id);

    expect(updated.groups.map((g) => g.name)).toEqual(["B", "A", "C"]);
  });

  it("moveGroupBefore is a no-op when beforeId equals groupId", () => {
    const a = Group.create("A");
    const b = Group.create("B");
    const parent = Group.create("Root").addGroup(a).addGroup(b);

    const updated = parent.moveGroupBefore(a.id, a.id);

    expect(updated.groups.map((g) => g.name)).toEqual(["A", "B"]);
  });

  it("moveGroupBefore is a no-op when beforeId is undefined and the group is already last", () => {
    const a = Group.create("A");
    const b = Group.create("B");
    const parent = Group.create("Root").addGroup(a).addGroup(b);

    const updated = parent.moveGroupBefore(b.id, undefined);

    expect(updated.groups.map((g) => g.name)).toEqual(["A", "B"]);
  });

  it("moveGroupBefore is a no-op when the group is already directly before beforeId", () => {
    const a = Group.create("A");
    const b = Group.create("B");
    const parent = Group.create("Root").addGroup(a).addGroup(b);

    const updated = parent.moveGroupBefore(a.id, b.id);

    expect(updated.groups.map((g) => g.name)).toEqual(["A", "B"]);
  });

  it("moveGroupBefore throws when groupId is not a child", () => {
    const parent = Group.create("Root").addGroup(Group.create("A"));

    expect(() => parent.moveGroupBefore(GroupId.create(), undefined)).toThrow(/not found/i);
  });

  it("moveGroupBefore throws when beforeId is not a child", () => {
    const a = Group.create("A");
    const parent = Group.create("Root").addGroup(a);

    expect(() => parent.moveGroupBefore(a.id, GroupId.create())).toThrow(/not found/i);
  });
});
