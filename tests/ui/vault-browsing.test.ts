import { describe, expect, it } from "vitest";
import { Entry, Group } from "../../src/domain";
import {
  collectAllEntries,
  countGroupContents,
  entriesOf,
  flattenGroupOptions,
  searchEntries,
} from "../../src/ui/vault-browsing";

describe("entriesOf", () => {
  it("returns only the group's own entries, paired with that group", () => {
    const entry = Entry.create({ title: "GitHub" });
    const group = Group.create("Work").addEntry(entry);

    const result = entriesOf(group);

    expect(result).toEqual([{ entry, group }]);
  });

  it("returns an empty array for a group with no entries", () => {
    const group = Group.create("Empty");

    expect(entriesOf(group)).toEqual([]);
  });
});

describe("collectAllEntries", () => {
  it("collects a group's own entries", () => {
    const entry = Entry.create({ title: "GitHub" });
    const group = Group.create("Work").addEntry(entry);

    expect(collectAllEntries(group)).toEqual([{ entry, group }]);
  });

  it("recursively collects entries from nested subgroups", () => {
    const rootEntry = Entry.create({ title: "Root Entry" });
    const childEntry = Entry.create({ title: "Child Entry" });
    const grandchildEntry = Entry.create({ title: "Grandchild Entry" });

    const grandchild = Group.create("Grandchild").addEntry(grandchildEntry);
    const child = Group.create("Child").addEntry(childEntry).addGroup(grandchild);
    const root = Group.create("Root").addEntry(rootEntry).addGroup(child);

    const result = collectAllEntries(root);

    expect(result).toEqual([
      { entry: rootEntry, group: root },
      { entry: childEntry, group: child },
      { entry: grandchildEntry, group: grandchild },
    ]);
  });

  it("returns an empty array for an empty tree", () => {
    const root = Group.create("Root");

    expect(collectAllEntries(root)).toEqual([]);
  });

  it("skips an excluded subgroup and everything nested inside it", () => {
    const rootEntry = Entry.create({ title: "Root Entry" });
    const binEntry = Entry.create({ title: "Bin Entry" });
    const nestedInBin = Group.create("Nested In Bin").addEntry(
      Entry.create({ title: "Deep Bin Entry" }),
    );
    const bin = Group.create("Recycle Bin").addEntry(binEntry).addGroup(nestedInBin);
    const root = Group.create("Root").addEntry(rootEntry).addGroup(bin);

    const result = collectAllEntries(root, [bin.id]);

    expect(result).toEqual([{ entry: rootEntry, group: root }]);
  });
});

describe("searchEntries", () => {
  it("keeps only entries whose entry matches the query", () => {
    const github = Entry.create({ title: "GitHub" });
    const gitlab = Entry.create({ title: "GitLab" });
    const other = Entry.create({ title: "Mail" });
    const group = Group.create("Work").addEntry(github).addEntry(gitlab).addEntry(other);

    const result = searchEntries(collectAllEntries(group), "git");

    expect(result).toEqual([
      { entry: github, group },
      { entry: gitlab, group },
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    const group = Group.create("Work").addEntry(Entry.create({ title: "GitHub" }));

    expect(searchEntries(collectAllEntries(group), "nonexistent")).toEqual([]);
  });
});

describe("flattenGroupOptions", () => {
  it("returns a single option for a group with no children", () => {
    const group = Group.create("Root");

    expect(flattenGroupOptions(group)).toEqual([{ id: group.id.toString(), label: "Root" }]);
  });

  it("flattens nested groups depth-first, indenting by depth", () => {
    const grandchild = Group.create("Grandchild");
    const child = Group.create("Child").addGroup(grandchild);
    const sibling = Group.create("Sibling");
    const root = Group.create("Root").addGroup(child).addGroup(sibling);

    expect(flattenGroupOptions(root)).toEqual([
      { id: root.id.toString(), label: "Root" },
      { id: child.id.toString(), label: "  Child" },
      { id: grandchild.id.toString(), label: "    Grandchild" },
      { id: sibling.id.toString(), label: "  Sibling" },
    ]);
  });

  it("skips an excluded subgroup and everything nested inside it", () => {
    const grandchild = Group.create("Grandchild");
    const child = Group.create("Child").addGroup(grandchild);
    const sibling = Group.create("Sibling");
    const root = Group.create("Root").addGroup(child).addGroup(sibling);

    expect(flattenGroupOptions(root, [child.id])).toEqual([
      { id: root.id.toString(), label: "Root" },
      { id: sibling.id.toString(), label: "  Sibling" },
    ]);
  });
});

describe("countGroupContents", () => {
  it("counts nothing for an empty group", () => {
    expect(countGroupContents(Group.create("Empty"))).toEqual({ entries: 0, groups: 0 });
  });

  it("counts the group's own entries", () => {
    const group = Group.create("Work")
      .addEntry(Entry.create({ title: "GitHub" }))
      .addEntry(Entry.create({ title: "GitLab" }));

    expect(countGroupContents(group)).toEqual({ entries: 2, groups: 0 });
  });

  it("counts entries and groups nested at any depth", () => {
    const grandchild = Group.create("Grandchild").addEntry(Entry.create({ title: "Deep" }));
    const child = Group.create("Child")
      .addEntry(Entry.create({ title: "Nested" }))
      .addGroup(grandchild);
    const root = Group.create("Root")
      .addEntry(Entry.create({ title: "Own" }))
      .addGroup(child);

    expect(countGroupContents(root)).toEqual({ entries: 3, groups: 2 });
  });
});
