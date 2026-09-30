import { describe, expect, it } from "vitest";
import {
  CustomIcon,
  CustomIcons,
  Entry,
  Group,
  Icon,
  MatchedEntryPair,
  Vault,
} from "../../src/domain";
import {
  applyVaultMerge,
  MERGE_GROUP_NAME,
  VaultMergeSelections,
} from "../../src/application/apply-vault-merge";

function emptySelections(): VaultMergeSelections {
  return { newEntries: [], resolvedConflicts: [], identicalEntriesToImport: [] };
}

function pairFor(targetEntry: Entry, sourceEntry: Entry): MatchedEntryPair {
  return { targetEntry, sourceEntry, differences: [] };
}

describe("applyVaultMerge", () => {
  it("returns the vault unchanged when nothing is selected", () => {
    const vault = Vault.create("Mine");

    const next = applyVaultMerge(vault, emptySelections());

    expect(next).toBe(vault);
  });

  it("creates a merge group and adds accepted new entries into it", () => {
    const vault = Vault.create("Mine");
    const incoming = Entry.create({ title: "New Site", username: "alice" });

    const next = applyVaultMerge(vault, { ...emptySelections(), newEntries: [incoming] });

    const mergeGroup = next.rootGroup.groups.find((g) => g.name === MERGE_GROUP_NAME);
    expect(mergeGroup).toBeDefined();
    expect(mergeGroup!.entries.map((e) => e.id.toString())).toEqual([incoming.id.toString()]);
  });

  it("reuses an existing merge group across two applications instead of creating a second one", () => {
    const vault = Vault.create("Mine");
    const first = applyVaultMerge(vault, {
      ...emptySelections(),
      newEntries: [Entry.create({ title: "First", username: "alice" })],
    });

    const second = applyVaultMerge(first, {
      ...emptySelections(),
      newEntries: [Entry.create({ title: "Second", username: "bob" })],
    });

    const mergeGroups = second.rootGroup.groups.filter((g) => g.name === MERGE_GROUP_NAME);
    expect(mergeGroups).toHaveLength(1);
    expect(mergeGroups[0].entries).toHaveLength(2);
  });

  describe("conflict resolutions", () => {
    it("leaves the target entry untouched for keep-mine", () => {
      const targetEntry = Entry.create({ title: "Bank", username: "alice", notes: "mine" });
      const vault = new Vault("Mine", Group.create("Mine").addEntry(targetEntry));
      const sourceEntry = Entry.create({ title: "Bank", username: "alice", notes: "theirs" });

      const next = applyVaultMerge(vault, {
        ...emptySelections(),
        resolvedConflicts: [{ pair: pairFor(targetEntry, sourceEntry), resolution: "keep-mine" }],
      });

      expect(next.findEntry(targetEntry.id)?.notes).toBe("mine");
      expect(next.rootGroup.groups.find((g) => g.name === MERGE_GROUP_NAME)).toBeUndefined();
    });

    it("overwrites the target entry's fields in place for use-theirs, keeping its id and location", () => {
      const targetEntry = Entry.create({ title: "Bank", username: "alice", notes: "mine" });
      const vault = new Vault("Mine", Group.create("Mine").addEntry(targetEntry));
      const sourceEntry = Entry.create({ title: "Bank", username: "alice", notes: "theirs" });

      const next = applyVaultMerge(vault, {
        ...emptySelections(),
        resolvedConflicts: [{ pair: pairFor(targetEntry, sourceEntry), resolution: "use-theirs" }],
      });

      const updated = next.findEntry(targetEntry.id);
      expect(updated?.notes).toBe("theirs");
      expect(next.rootGroup.entries).toHaveLength(1);
    });

    it("adds the source entry into the merge group for keep-both, leaving the target entry alone", () => {
      const targetEntry = Entry.create({ title: "Bank", username: "alice", notes: "mine" });
      const vault = new Vault("Mine", Group.create("Mine").addEntry(targetEntry));
      const sourceEntry = Entry.create({ title: "Bank", username: "alice", notes: "theirs" });

      const next = applyVaultMerge(vault, {
        ...emptySelections(),
        resolvedConflicts: [{ pair: pairFor(targetEntry, sourceEntry), resolution: "keep-both" }],
      });

      expect(next.findEntry(targetEntry.id)?.notes).toBe("mine");
      const mergeGroup = next.rootGroup.groups.find((g) => g.name === MERGE_GROUP_NAME);
      expect(mergeGroup?.entries.map((e) => e.id.toString())).toEqual([sourceEntry.id.toString()]);
    });
  });

  it("imports identical entries the user opted into, into the merge group", () => {
    const vault = Vault.create("Mine");
    const sourceEntry = Entry.create({ title: "Bank", username: "alice" });

    const next = applyVaultMerge(vault, {
      ...emptySelections(),
      identicalEntriesToImport: [sourceEntry],
    });

    const mergeGroup = next.rootGroup.groups.find((g) => g.name === MERGE_GROUP_NAME);
    expect(mergeGroup?.entries.map((e) => e.id.toString())).toEqual([sourceEntry.id.toString()]);
  });

  describe("custom icons", () => {
    const logo = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000abcd", new Uint8Array([1]));
    const unused = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000ef01", new Uint8Array([2]));

    it("brings over the images that imported entries use, and nothing else", () => {
      const vault = Vault.create("Mine");
      const incoming = Entry.create({ title: "New Site", icon: Icon.custom(logo.id) });

      const next = applyVaultMerge(
        vault,
        { ...emptySelections(), newEntries: [incoming] },
        new CustomIcons([logo, unused]),
      );

      expect(next.customIcons.values).toEqual([logo]);
    });

    it('brings over the image of an entry taken as "use theirs"', () => {
      const targetEntry = Entry.create({ title: "Bank", username: "alice" });
      const sourceEntry = Entry.create({
        title: "Bank",
        username: "alice",
        icon: Icon.custom(logo.id),
      });
      const vault = new Vault("Mine", Group.create("Mine").addEntry(targetEntry));

      const next = applyVaultMerge(
        vault,
        {
          ...emptySelections(),
          resolvedConflicts: [
            { pair: pairFor(targetEntry, sourceEntry), resolution: "use-theirs" },
          ],
        },
        new CustomIcons([logo]),
      );

      expect(next.customIcons.has(logo.id)).toBe(true);
      expect(next.findEntry(targetEntry.id)?.icon.key).toBe(logo.id);
    });
  });
});
