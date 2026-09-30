import { describe, expect, it } from "vitest";
import { Entry, Group, Vault } from "../../src/domain";
import { applyExpiredEntryAction, nextExpiry } from "../../src/application/entry-expiry";

const NOW = new Date("2026-06-01T12:00:00Z");
const PAST = new Date("2026-05-01T00:00:00Z");
const SOON = new Date("2026-06-02T00:00:00Z");
const LATER = new Date("2026-09-01T00:00:00Z");

function vaultWith(...entries: Entry[]): Vault {
  return new Vault(
    "Root",
    entries.reduce((group, entry) => group.addEntry(entry), Group.create("Root")),
  );
}

describe("applyExpiredEntryAction", () => {
  const expired = Entry.create({ title: "Old", expiresAt: PAST });
  const current = Entry.create({ title: "Current", expiresAt: LATER });

  it("leaves the vault itself alone when expired entries are only marked", () => {
    const vault = vaultWith(expired, current);

    expect(applyExpiredEntryAction(vault, "mark", NOW)).toBe(vault);
  });

  it.each(["recycle", "delete"] as const)(
    "returns the vault itself when nothing has expired (%s)",
    (action) => {
      const vault = vaultWith(current);

      expect(applyExpiredEntryAction(vault, action, NOW)).toBe(vault);
    },
  );

  it("moves expired entries into the recycle bin", () => {
    const next = applyExpiredEntryAction(vaultWith(expired, current), "recycle", NOW);

    expect(next.recycleBin!.entries).toEqual([expired]);
    expect(next.rootGroup.entries).toEqual([current]);
    expect(next.purgedEntryIds).toEqual([]);
  });

  it("purges expired entries outright", () => {
    const next = applyExpiredEntryAction(vaultWith(expired, current), "delete", NOW);

    expect(next.findEntry(expired.id)).toBeUndefined();
    expect(next.recycleBin).toBeUndefined();
    expect(next.purgedEntryIds).toEqual([expired.id]);
  });
});

describe("nextExpiry", () => {
  it("is the soonest expiry date still ahead", () => {
    const vault = vaultWith(
      Entry.create({ expiresAt: LATER }),
      Entry.create({ expiresAt: PAST }),
      Entry.create({ expiresAt: SOON }),
      Entry.create(),
    );

    expect(nextExpiry(vault, NOW)).toEqual(SOON);
  });

  it("is undefined when nothing is due to expire", () => {
    expect(nextExpiry(vaultWith(Entry.create({ expiresAt: PAST })), NOW)).toBeUndefined();
    expect(nextExpiry(vaultWith(Entry.create()), NOW)).toBeUndefined();
  });
});
