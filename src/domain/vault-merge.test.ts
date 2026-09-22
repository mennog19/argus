import { describe, expect, it } from "vitest";
import { CustomField } from "./custom-field";
import { CustomFields } from "./custom-fields";
import { Entry } from "./entry";
import { Group } from "./group";
import { Password } from "./password";
import { Tag } from "./tag";
import { Tags } from "./tags";
import { Vault } from "./vault";
import { diffVaults } from "./vault-merge";

function vaultWithEntries(name: string, entries: readonly Entry[]): Vault {
  let root = Group.create(name);
  for (const entry of entries) {
    root = root.addEntry(entry);
  }
  return new Vault(name, root);
}

describe("diffVaults", () => {
  it("treats an entry with no matching title/url as new", () => {
    const target = vaultWithEntries("Target", []);
    const source = vaultWithEntries("Source", [Entry.create({ title: "Bank", username: "alice" })]);

    const plan = diffVaults(target, source);

    expect(plan.newEntries).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
    expect(plan.identical).toEqual([]);
  });

  it("matches entries by title + username, case-insensitively and ignoring whitespace", () => {
    const targetEntry = Entry.create({ title: "  Bank  ", username: "Alice" });
    const target = vaultWithEntries("Target", [targetEntry]);
    const source = vaultWithEntries("Source", [Entry.create({ title: "bank", username: "alice" })]);

    const plan = diffVaults(target, source);

    // The match itself is case/whitespace-insensitive, but the raw values still
    // differ, so this is a matched pair with differences, not an identical one.
    expect(plan.newEntries).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].targetEntry.equals(targetEntry)).toBe(true);
  });

  it("matches entries by url + username when titles differ", () => {
    const targetEntry = Entry.create({
      title: "Old Name",
      username: "alice",
      url: "https://example.com",
    });
    const target = vaultWithEntries("Target", [targetEntry]);
    const source = vaultWithEntries("Source", [
      Entry.create({ title: "New Name", username: "alice", url: "https://example.com" }),
    ]);

    const plan = diffVaults(target, source);

    expect(plan.newEntries).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].targetEntry.equals(targetEntry)).toBe(true);
  });

  it("does not match on title alone when usernames differ", () => {
    const target = vaultWithEntries("Target", [Entry.create({ title: "Bank", username: "alice" })]);
    const source = vaultWithEntries("Source", [Entry.create({ title: "Bank", username: "bob" })]);

    const plan = diffVaults(target, source);

    expect(plan.newEntries).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
  });

  it("does not match when usernames match but both title and url are blank", () => {
    const target = vaultWithEntries("Target", [Entry.create({ username: "alice" })]);
    const source = vaultWithEntries("Source", [Entry.create({ username: "alice" })]);

    const plan = diffVaults(target, source);

    expect(plan.newEntries).toHaveLength(1);
  });

  it("does not match when usernames are both blank", () => {
    const target = vaultWithEntries("Target", [Entry.create({ title: "Bank" })]);
    const source = vaultWithEntries("Source", [Entry.create({ title: "Bank" })]);

    const plan = diffVaults(target, source);

    expect(plan.newEntries).toHaveLength(1);
  });

  it("reports no differences for a pair that matches on every diffed field", () => {
    const shared = {
      title: "Bank",
      username: "alice",
      password: new Password("secret"),
      url: "https://bank.example",
      notes: "note",
      tags: new Tags([new Tag("finance")]),
      customFields: new CustomFields([new CustomField("PIN", "1234")]),
    };
    const target = vaultWithEntries("Target", [Entry.create(shared)]);
    const source = vaultWithEntries("Source", [Entry.create(shared)]);

    const plan = diffVaults(target, source);

    expect(plan.identical).toHaveLength(1);
    expect(plan.identical[0].differences).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it("reports a difference per diffed field that doesn't match", () => {
    const target = vaultWithEntries("Target", [
      Entry.create({
        title: "Bank",
        username: "alice",
        password: new Password("old-secret"),
        url: "https://bank.example",
        notes: "old note",
        tags: new Tags([new Tag("finance")]),
        customFields: new CustomFields([new CustomField("PIN", "1111")]),
      }),
    ]);
    const source = vaultWithEntries("Source", [
      Entry.create({
        title: "Bank",
        username: "alice",
        password: new Password("new-secret"),
        url: "https://bank.example/login",
        notes: "new note",
        tags: new Tags([new Tag("work")]),
        customFields: new CustomFields([new CustomField("PIN", "2222")]),
      }),
    ]);

    const plan = diffVaults(target, source);

    expect(plan.conflicts).toHaveLength(1);
    const fields = plan.conflicts[0].differences.map((d) => d.field).sort();
    expect(fields).toEqual(["customFields", "notes", "password", "tags", "url"]);
    const passwordDiff = plan.conflicts[0].differences.find((d) => d.field === "password");
    expect(passwordDiff).toEqual({
      field: "password",
      targetValue: "old-secret",
      sourceValue: "new-secret",
    });
  });

  it("pairs each target entry with at most one source entry, greedily in source order", () => {
    const targetEntry = Entry.create({ title: "Bank", username: "alice" });
    const target = vaultWithEntries("Target", [targetEntry]);
    const firstSource = Entry.create({ title: "Bank", username: "alice", notes: "first" });
    const secondSource = Entry.create({ title: "Bank", username: "alice", notes: "second" });
    const source = vaultWithEntries("Source", [firstSource, secondSource]);

    const plan = diffVaults(target, source);

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].sourceEntry.equals(firstSource)).toBe(true);
    expect(plan.newEntries).toHaveLength(1);
    expect(plan.newEntries[0].equals(secondSource)).toBe(true);
  });

  it("recurses into nested groups on both sides", () => {
    const nestedTargetEntry = Entry.create({ title: "Nested", username: "alice" });
    const target = new Vault(
      "Target",
      Group.create("Target").addGroup(Group.create("Sub").addEntry(nestedTargetEntry)),
    );
    const nestedSourceEntry = Entry.create({
      title: "nested",
      username: "alice",
      notes: "changed",
    });
    const source = new Vault(
      "Source",
      Group.create("Source").addGroup(Group.create("Sub").addEntry(nestedSourceEntry)),
    );

    const plan = diffVaults(target, source);

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].targetEntry.equals(nestedTargetEntry)).toBe(true);
  });

  it("ignores entries inside either vault's recycle bin", () => {
    const recycledEntry = Entry.create({ title: "Old", username: "alice" });
    const bin = Group.create("Recycle Bin").addEntry(recycledEntry);
    let targetRoot = Group.create("Target");
    targetRoot = targetRoot.addGroup(bin);
    const target = new Vault("Target", targetRoot, bin.id);

    const source = vaultWithEntries("Source", [Entry.create({ title: "Old", username: "alice" })]);

    const plan = diffVaults(target, source);

    expect(plan.newEntries).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
  });
});
