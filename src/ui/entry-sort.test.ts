import { describe, expect, it } from "vitest";
import { Entry, Group } from "../domain";
import { ENTRY_SORT_OPTIONS, sortEntries } from "./entry-sort";
import { EntryWithGroup } from "./vault-browsing";

const group = Group.create("Mine");

function item(title: string, accessedAt?: Date): EntryWithGroup {
  return { entry: Entry.create({ title, times: { accessedAt } }), group };
}

function titles(entries: readonly EntryWithGroup[]): string[] {
  return entries.map(({ entry }) => entry.title);
}

describe("ENTRY_SORT_OPTIONS", () => {
  it("offers a labelled, directed option for every sort order, vault order first", () => {
    expect(ENTRY_SORT_OPTIONS[0]).toEqual({
      id: "manual",
      label: "Vault order",
      direction: "none",
    });
    expect(ENTRY_SORT_OPTIONS.map((option) => [option.id, option.direction])).toEqual([
      ["manual", "none"],
      ["title-asc", "asc"],
      ["title-desc", "desc"],
      ["accessed-desc", "desc"],
      ["accessed-asc", "asc"],
    ]);
  });
});

describe("sortEntries", () => {
  it("leaves the vault's own order untouched for 'manual'", () => {
    const entries = [item("Zeta"), item("Alpha"), item("Mu")];

    expect(titles(sortEntries(entries, "manual"))).toEqual(["Zeta", "Alpha", "Mu"]);
  });

  it("does not mutate the entries it was given", () => {
    const entries = [item("Zeta"), item("Alpha")];

    sortEntries(entries, "title-asc");

    expect(titles(entries)).toEqual(["Zeta", "Alpha"]);
  });

  it("sorts by title A-Z, ignoring case", () => {
    const entries = [item("zeta"), item("Alpha"), item("Mu")];

    expect(titles(sortEntries(entries, "title-asc"))).toEqual(["Alpha", "Mu", "zeta"]);
  });

  it("sorts by title Z-A", () => {
    const entries = [item("zeta"), item("Alpha"), item("Mu")];

    expect(titles(sortEntries(entries, "title-desc"))).toEqual(["zeta", "Mu", "Alpha"]);
  });

  it("sorts most recently opened first", () => {
    const entries = [
      item("Old", new Date("2026-01-01T00:00:00Z")),
      item("New", new Date("2026-03-01T00:00:00Z")),
      item("Middle", new Date("2026-02-01T00:00:00Z")),
    ];

    expect(titles(sortEntries(entries, "accessed-desc"))).toEqual(["New", "Middle", "Old"]);
  });

  it("sorts least recently opened first", () => {
    const entries = [
      item("Old", new Date("2026-01-01T00:00:00Z")),
      item("New", new Date("2026-03-01T00:00:00Z")),
      item("Middle", new Date("2026-02-01T00:00:00Z")),
    ];

    expect(titles(sortEntries(entries, "accessed-asc"))).toEqual(["Old", "Middle", "New"]);
  });

  it("puts never-opened entries last in both directions", () => {
    const entries = [
      item("Never"),
      item("Opened", new Date("2026-01-01T00:00:00Z")),
      item("AlsoNever"),
    ];

    expect(titles(sortEntries(entries, "accessed-desc"))).toEqual(["Opened", "Never", "AlsoNever"]);
    expect(titles(sortEntries(entries, "accessed-asc"))).toEqual(["Opened", "Never", "AlsoNever"]);
  });

  it("keeps vault order between entries the sort can't tell apart", () => {
    const entries = [item("Never"), item("AlsoNever")];

    expect(titles(sortEntries(entries, "accessed-desc"))).toEqual(["Never", "AlsoNever"]);
  });
});
