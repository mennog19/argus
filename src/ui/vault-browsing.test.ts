import { describe, expect, it } from "vitest";
import { Entry, Group } from "../domain";
import { collectAllEntries, entriesOf } from "./vault-browsing";

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
});
