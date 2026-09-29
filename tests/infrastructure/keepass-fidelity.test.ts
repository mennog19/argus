// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Kdbx } from "kdbxweb";
import { CustomField, Entry, Password, totpConfigFromCustomFields } from "../../src/domain";
import { VaultSession } from "../../src/application/vault-repository";
import { KdbxVaultRepository } from "../../src/infrastructure/kdbx-vault-repository";
import {
  KEEPASS_FIXTURE_PASSWORD,
  KeePassFixture,
  findEntry,
  loadRaw,
  readKeePassFixture,
  snapshotEntry,
  snapshotRevision,
  snapshotVault,
  textualDateElements,
} from "./keepass-fixtures";

/**
 * Round trips through vaults KeePass 2.x wrote itself. The kdbxweb-made
 * fixtures elsewhere only show kdbxweb agrees with itself; these show that a
 * file from a real KeePass comes back out of Argus with everything Argus
 * didn't edit still exactly as KeePass wrote it.
 */
describe.each<{ file: KeePassFixture; version: [number, number]; name: string }>([
  { file: "kdbx3-aes.kdbx", version: [3, 1], name: "KeePass KDBX3" },
  { file: "kdbx4-argon2id.kdbx", version: [4, 1], name: "KeePass KDBX4" },
])("KeePass-written $file", ({ file, version, name }) => {
  async function open() {
    const bytes = readKeePassFixture(file);
    const session = await new KdbxVaultRepository().openVault(bytes, {
      password: KEEPASS_FIXTURE_PASSWORD,
    });
    return { original: await loadRaw(bytes), session };
  }

  it("is the format the fixture is meant to cover", async () => {
    const { original } = await open();

    expect([original.header.versionMajor, original.header.versionMinor]).toEqual(version);
  });

  it("maps KeePass's groups, entries, fields and recycle bin into the vault", async () => {
    const { session } = await open();
    const { vault } = session;

    expect(vault.name).toBe(name);
    expect(vault.rootGroup.entries.map((e) => e.title).sort()).toEqual([
      "Edited In Argus",
      "Everything Entry",
      "Reference Entry",
    ]);
    const email = vault.rootGroup.groups.find((g) => g.name === "Email")!;
    expect(email.groups[0].name).toBe("Work");
    expect(email.groups[0].entries[0].url).toBe("mail.example.com");
    expect(vault.recycleBin?.entries.map((e) => e.title)).toEqual(["Deleted Login"]);

    const everything = vault.rootGroup.entries.find((e) => e.title === "Everything Entry")!;
    expect(everything.username).toBe("alice@example.com");
    expect(everything.password.reveal()).toBe("S3cret!pass");
    expect(everything.notes).toBe('Notes with <xml> & "quotes" and ünicode ✓');
    expect(everything.tags.values.map((tag) => tag.toString()).sort()).toEqual([
      "finance",
      "shared",
    ]);
    expect(everything.customFields.get("Recovery Codes")?.value).toBe("1111-2222\n3333-4444");
    expect(everything.customFields.get("PIN")).toEqual(new CustomField("PIN", "4321", true));
    expect(totpConfigFromCustomFields(everything.customFields)?.secret).toBe("JBSWY3DPEHPK3PXP");
  });

  it("writes dates in the form KeePass expects for the format", async () => {
    const { original, session } = await open();

    const saved = await loadRaw(await session.save(session.vault));

    // KDBX3 writes every date as text; KDBX4 writes every one as base64.
    const textual = (db: Kdbx) => textualDateElements(db).length > 0;
    expect(textual(original)).toBe(version[0] === 3);
    expect(textualDateElements(saved)).toEqual(
      version[0] === 3 ? textualDateElements(original) : [],
    );
  });

  it("saves an unedited vault with nothing KeePass wrote changed", async () => {
    const { original, session } = await open();

    const saved = await loadRaw(await session.save(session.vault));

    expect(snapshotVault(saved)).toEqual(snapshotVault(original));
  });

  it("changes only the edited entry, and keeps its attachments and history", async () => {
    const { original, session } = await open();
    const edited = session.vault.rootGroup.entries.find((e) => e.title === "Edited In Argus")!;

    const savedBytes = await session.save(
      session.vault.updateEntry(edited.update({ password: new Password("Argus-edit1!") })),
    );
    const saved = await loadRaw(savedBytes);

    const before = snapshotVault(original);
    const after = snapshotVault(saved);
    const editedId = findEntry(original, "Edited In Argus").uuid.id;
    const { [editedId]: beforeEntry, ...beforeOthers } = before.entries;
    const { [editedId]: afterEntry, ...afterOthers } = after.entries;
    expect(afterOthers).toEqual(beforeOthers);
    expect({ ...after, entries: undefined }).toEqual({ ...before, entries: undefined });

    // The pre-edit state became the newest history revision, after the one
    // KeePass had already recorded.
    const originalEntry = findEntry(original, "Edited In Argus");
    expect(afterEntry.history).toEqual([...beforeEntry.history, snapshotRevision(originalEntry)]);
    expect(afterEntry.fields.Password).toEqual({ protected: true, text: "Argus-edit1!" });
    // Everything the edit didn't touch, bar the modification times, is as KeePass wrote it.
    const unchanged = (entry: ReturnType<typeof snapshotEntry>) => ({
      ...entry,
      fields: { ...entry.fields, Password: undefined },
      times: { ...entry.times, lastModTime: undefined, lastAccessTime: undefined },
      history: undefined,
    });
    expect(unchanged(afterEntry)).toEqual(unchanged(beforeEntry));
    expect(Object.keys(afterEntry.binaries)).toEqual(["notes.txt"]);
  });

  describe("entry history", () => {
    async function openEverything() {
      const opened = await open();
      const entry = opened.session.vault.rootGroup.entries.find(
        (e) => e.title === "Everything Entry",
      )!;
      const id = findEntry(opened.original, "Everything Entry").uuid.id;
      return { ...opened, entry, id };
    }

    async function saveEntry(session: VaultSession, entry: Entry) {
      return loadRaw(await session.save(session.vault.updateEntry(entry)));
    }

    it("maps KeePass's revisions, oldest first, with their times", async () => {
      const { entry, original } = await openEverything();

      expect(entry.history.map((revision) => revision.password.reveal())).toEqual([
        "S3cret!pass",
        "S3cret!pass-v2",
      ]);
      const raw = findEntry(original, "Everything Entry").history;
      expect(entry.history.map((revision) => revision.times.modifiedAt)).toEqual(
        raw.map((revision) => revision.times.lastModTime),
      );
      expect(entry.history.every((revision) => revision.history.length === 0)).toBe(true);
    });

    it("deletes one revision from the file and leaves everything else as KeePass wrote it", async () => {
      const { entry, original, session, id } = await openEverything();

      const saved = await saveEntry(session, entry.deleteRevision(1));

      const before = snapshotVault(original);
      const after = snapshotVault(saved);
      expect(after.entries[id].history).toEqual([before.entries[id].history[0]]);
      expect({ ...after.entries[id], history: undefined }).toEqual({
        ...before.entries[id],
        history: undefined,
      });
      const others = (entries: typeof after.entries) =>
        Object.entries(entries).filter(([entryId]) => entryId !== id);
      expect(others(after.entries)).toEqual(others(before.entries));
    });

    it("restores a revision, keeping the version it replaces as the newest revision", async () => {
      const { entry, original, session, id } = await openEverything();

      const saved = await saveEntry(session, entry.restoreRevision(1));

      const before = snapshotVault(original).entries[id];
      const after = snapshotVault(saved).entries[id];
      expect(after.fields.Password).toEqual({ protected: true, text: "S3cret!pass-v2" });
      expect(after.history).toEqual([
        ...before.history,
        snapshotRevision(findEntry(original, "Everything Entry")),
      ]);
      // Attachments belong to the entry, not to what the domain restores.
      expect(after.binaries).toEqual(before.binaries);
    });

    it("leaves the file's history alone when the vault's doesn't match it", async () => {
      const { entry, original, session, id } = await openEverything();
      const unknown = entry.history[0].update({ password: new Password("never-saved") });

      const saved = await saveEntry(session, entry.update({ history: [unknown] }));

      expect(snapshotVault(saved).entries[id].history).toEqual(
        snapshotVault(original).entries[id].history,
      );
    });

    it("refreshes the session's vault from what it saved", async () => {
      const { session } = await open();
      const edited = session.vault.rootGroup.entries.find((e) => e.title === "Edited In Argus")!;

      await session.save(
        session.vault.updateEntry(edited.update({ password: new Password("Argus-edit1!") })),
      );

      const refreshed = session.vault.findEntry(edited.id)!;
      expect(refreshed.password.reveal()).toBe("Argus-edit1!");
      expect(refreshed.history.map((revision) => revision.password.reveal())).toEqual([
        "first-password",
        "second-password",
      ]);
    });
  });
});

describe("KeePass-written vault with a key file", () => {
  const bytes = () => readKeePassFixture("keyfile.kdbx");
  const keyFile = () => readKeePassFixture("keyfile.keyx");

  it("opens with the password and KeePass's key file together", async () => {
    const session = await new KdbxVaultRepository().openVault(bytes(), {
      password: KEEPASS_FIXTURE_PASSWORD,
      keyFile: keyFile(),
    });

    expect(session.vault.rootGroup.entries.map((e) => e.title)).toEqual(["Keyed Entry"]);
  });

  it("refuses the password alone", async () => {
    await expect(
      new KdbxVaultRepository().openVault(bytes(), { password: KEEPASS_FIXTURE_PASSWORD }),
    ).rejects.toThrow("If this vault uses a key file");
  });

  it("saves a file that still needs the same key file", async () => {
    const original = await loadRaw(bytes(), keyFile());
    const session = await new KdbxVaultRepository().openVault(bytes(), {
      password: KEEPASS_FIXTURE_PASSWORD,
      keyFile: keyFile(),
    });

    const savedBytes = await session.save(session.vault);

    await expect(loadRaw(savedBytes)).rejects.toThrow();
    const saved: Kdbx = await loadRaw(savedBytes, keyFile());
    expect(snapshotVault(saved)).toEqual(snapshotVault(original));
  });
});
