// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Credentials, Kdbx, KdbxEntry, ProtectedValue } from "kdbxweb";
import { trimHistory } from "../../src/infrastructure/kdbx-history";

function createDb(): Kdbx {
  return Kdbx.create(new Credentials(null), "Test Vault");
}

/** An entry whose history holds `count` revisions titled "v0" (oldest) onward. */
function entryWithHistory(db: Kdbx, count: number): KdbxEntry {
  const entry = db.createEntry(db.getDefaultGroup());
  for (let i = 0; i < count; i++) {
    entry.fields.set("Title", `v${i}`);
    entry.pushHistory();
  }
  entry.fields.set("Title", "current");
  return entry;
}

function historyTitles(entry: KdbxEntry): unknown[] {
  return entry.history.map((revision) => revision.fields.get("Title"));
}

describe("trimHistory", () => {
  it("drops the oldest revisions beyond historyMaxItems", () => {
    const db = createDb();
    db.meta.historyMaxItems = 3;
    const entry = entryWithHistory(db, 5);

    trimHistory(entry, db.meta);

    expect(historyTitles(entry)).toEqual(["v2", "v3", "v4"]);
    expect(entry.fields.get("Title")).toBe("current");
  });

  it("records a tombstone for each removed revision so a merge can't resurrect it", () => {
    const db = createDb();
    db.meta.historyMaxItems = 1;
    const entry = entryWithHistory(db, 3);

    trimHistory(entry, db.meta);

    expect(entry._editState?.deleted).toHaveLength(2);
  });

  it("keeps every revision when historyMaxItems is negative", () => {
    const db = createDb();
    db.meta.historyMaxItems = -1;
    const entry = entryWithHistory(db, 15);

    trimHistory(entry, db.meta);

    expect(entry.history).toHaveLength(15);
  });

  it("falls back to KeePass's default of 10 items when the file sets no limit", () => {
    const db = createDb();
    db.meta.historyMaxItems = undefined;
    const entry = entryWithHistory(db, 12);

    trimHistory(entry, db.meta);

    expect(historyTitles(entry)).toEqual([
      "v2",
      "v3",
      "v4",
      "v5",
      "v6",
      "v7",
      "v8",
      "v9",
      "v10",
      "v11",
    ]);
  });

  it("clears the history entirely when historyMaxItems is 0", () => {
    const db = createDb();
    db.meta.historyMaxItems = 0;
    const entry = entryWithHistory(db, 2);

    trimHistory(entry, db.meta);

    expect(entry.history).toHaveLength(0);
  });

  it("drops the oldest revisions until the history fits historyMaxSize", () => {
    const db = createDb();
    db.meta.historyMaxSize = 2500;
    const entry = db.createEntry(db.getDefaultGroup());
    for (let i = 0; i < 4; i++) {
      entry.fields.set("Title", `v${i}`);
      entry.fields.set("Notes", "x".repeat(1000));
      entry.pushHistory();
    }

    trimHistory(entry, db.meta);

    expect(historyTitles(entry)).toEqual(["v2", "v3"]);
  });

  it("counts protected fields, tags, and attachments toward historyMaxSize", async () => {
    const db = createDb();
    db.meta.historyMaxSize = 1500;
    const entry = db.createEntry(db.getDefaultGroup());
    const shared = await db.createBinary(new Uint8Array(400).buffer);

    entry.fields.set("Title", "raw");
    entry.fields.set("Password", ProtectedValue.fromString("p".repeat(100)));
    entry.tags = ["tag"];
    entry.binaries.set("raw.bin", new Uint8Array(600).buffer);
    entry.pushHistory();

    entry.binaries.clear();
    entry.fields.set("Title", "hashed");
    entry.binaries.set("shared.bin", shared);
    entry.pushHistory();

    entry.fields.set("Title", "protected");
    entry.binaries.set("secret.bin", ProtectedValue.fromString("s".repeat(400)));
    entry.pushHistory();

    trimHistory(entry, db.meta);

    // raw ≈ 740 bytes, hashed ≈ 540, protected ≈ 945: only the newest two fit.
    expect(historyTitles(entry)).toEqual(["hashed", "protected"]);
  });

  it("keeps everything when historyMaxSize is negative", () => {
    const db = createDb();
    db.meta.historyMaxSize = -1;
    const entry = db.createEntry(db.getDefaultGroup());
    entry.fields.set("Notes", "x".repeat(10_000));
    entry.pushHistory();
    entry.pushHistory();

    trimHistory(entry, db.meta);

    expect(entry.history).toHaveLength(2);
  });

  it("falls back to KeePass's default of 6 MiB when the file sets no size limit", () => {
    const db = createDb();
    db.meta.historyMaxSize = undefined;
    const entry = db.createEntry(db.getDefaultGroup());
    entry.binaries.set("big.bin", new Uint8Array(4 * 1024 * 1024).buffer);
    entry.pushHistory();
    entry.pushHistory();

    trimHistory(entry, db.meta);

    expect(entry.history).toHaveLength(1);
  });
});
