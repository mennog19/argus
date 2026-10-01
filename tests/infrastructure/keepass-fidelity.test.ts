// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ByteUtils, Consts, Int64, Kdbx } from "kdbxweb";
import {
  Attachment,
  CustomField,
  Entry,
  Password,
  totpConfigFromCustomFields,
} from "../../src/domain";
import { VaultSession } from "../../src/application/vault-repository";
import { DEFAULT_KDF } from "../../src/application/vault-settings";
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

  it("maps KeePass's attachments, protected or not, on entries and their revisions", async () => {
    const { session } = await open();
    const everything = session.vault.rootGroup.entries.find((e) => e.title === "Everything Entry")!;

    const { attachments } = everything;
    expect(attachments.values.map((attachment) => attachment.name)).toEqual([
      "photo.bin",
      "secret.txt",
    ]);
    expect(attachments.get("photo.bin")?.data).toEqual(
      Uint8Array.from({ length: 256 }, (_, i) => i),
    );
    expect(new TextDecoder().decode(attachments.get("secret.txt")?.data)).toBe(
      "a protected attachment",
    );
    expect(
      everything.history.map((revision) => revision.attachments.values.map(({ name }) => name)),
    ).toEqual([["photo.bin", "secret.txt"], ["secret.txt"]]);
  });

  describe("attachments edited in Argus", () => {
    const binaryNames = (revision: ReturnType<typeof snapshotRevision>) =>
      Object.keys(revision.binaries);

    async function openEdited() {
      const opened = await open();
      const entry = opened.session.vault.rootGroup.entries.find(
        (e) => e.title === "Edited In Argus",
      )!;
      const id = findEntry(opened.original, "Edited In Argus").uuid.id;
      return { ...opened, entry, id };
    }

    async function saveAttachments(session: VaultSession, entry: Entry) {
      const bytes = await session.save(session.vault.updateEntry(entry));
      return { bytes, saved: await loadRaw(bytes) };
    }

    it("adds a file next to KeePass's own, leaving every other entry as KeePass wrote it", async () => {
      const { original, session, entry, id } = await openEdited();
      const added = new Attachment("added.bin", new Uint8Array([10, 20, 30]));

      const { saved } = await saveAttachments(
        session,
        entry.update({ attachments: entry.attachments.attach(added) }),
      );

      const before = snapshotVault(original);
      const after = snapshotVault(saved);
      expect(after.entries[id].binaries).toEqual({
        ...before.entries[id].binaries,
        "added.bin": "0a141e",
      });
      // The version without the file became the newest revision.
      expect(after.entries[id].history.map(binaryNames)).toEqual([["notes.txt"], ["notes.txt"]]);
      const others = (entries: typeof after.entries) =>
        Object.entries(entries).filter(([entryId]) => entryId !== id);
      expect(others(after.entries)).toEqual(others(before.entries));
      expect({ ...after, entries: undefined }).toEqual({ ...before, entries: undefined });
    });

    it("reads an added file back when the saved vault is opened again", async () => {
      const { session, entry } = await openEdited();
      const added = new Attachment("added.bin", new Uint8Array([10, 20, 30]));

      const { bytes } = await saveAttachments(
        session,
        entry.update({ attachments: entry.attachments.attach(added) }),
      );

      const reopened = await new KdbxVaultRepository().openVault(bytes, {
        password: KEEPASS_FIXTURE_PASSWORD,
      });
      const { attachments } = reopened.vault.findEntry(entry.id)!;
      expect(attachments.get("added.bin")?.data).toEqual(new Uint8Array([10, 20, 30]));
      expect(new TextDecoder().decode(attachments.get("notes.txt")?.data)).toBe(
        "attachment on the edited entry",
      );
      // And the session that saved it carries on from the same contents.
      expect(session.vault.findEntry(entry.id)!.attachments.equals(attachments)).toBe(true);
    });

    it("renames a file without touching its bytes", async () => {
      const { original, session, entry, id } = await openEdited();

      const { saved } = await saveAttachments(
        session,
        entry.update({ attachments: entry.attachments.rename("notes.txt", "renamed.txt") }),
      );

      expect(snapshotVault(saved).entries[id].binaries).toEqual({
        "renamed.txt": snapshotVault(original).entries[id].binaries["notes.txt"],
      });
    });

    it("removes a file from the entry, which its history still holds", async () => {
      const { session, entry, id } = await openEdited();

      const { saved } = await saveAttachments(
        session,
        entry.update({ attachments: entry.attachments.remove("notes.txt") }),
      );

      const after = snapshotVault(saved).entries[id];
      expect(after.binaries).toEqual({});
      expect(after.history.map(binaryNames)).toEqual([["notes.txt"], ["notes.txt"]]);
      expect(saved.binaries.getAll()).toHaveLength(3);
    });

    it("drops a file's bytes from the vault once no revision holds it either", async () => {
      const { session, entry, id } = await openEdited();
      await saveAttachments(
        session,
        entry.update({ attachments: entry.attachments.remove("notes.txt") }),
      );
      let current = session.vault.findEntry(entry.id)!;
      while (current.history.length > 0) {
        current = current.deleteRevision(0);
      }

      const { saved } = await saveAttachments(session, current);

      expect(snapshotVault(saved).entries[id].history).toEqual([]);
      // Only the Everything Entry's two files are left in the pool.
      expect(saved.binaries.getAll()).toHaveLength(2);
    });
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
      // The revision's attachments come back with it, as in KeePass: this
      // one predates `photo.bin` being added again.
      expect(after.binaries).toEqual(before.history[1].binaries);
      expect(Object.keys(after.binaries)).toEqual(["secret.txt"]);
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

describe("upgrading KeePass's KDBX3 vault to KDBX 4", () => {
  async function upgradeAndSave() {
    const bytes = readKeePassFixture("kdbx3-aes.kdbx");
    const session = await new KdbxVaultRepository().openVault(bytes, {
      password: KEEPASS_FIXTURE_PASSWORD,
    });
    session.upgradeFormat();
    const saved = await loadRaw(await session.save(session.vault));
    return { original: await loadRaw(bytes), session, saved };
  }

  it("reports the format before and after", async () => {
    const session = await new KdbxVaultRepository().openVault(
      readKeePassFixture("kdbx3-aes.kdbx"),
      { password: KEEPASS_FIXTURE_PASSWORD },
    );

    expect(session.format).toEqual({ major: 3, minor: 1 });
    session.upgradeFormat();
    expect(session.format).toEqual({ major: 4, minor: 0 });
  });

  it("writes KDBX 4 with Argon2id at DEFAULT_KDF strength and base64 dates", async () => {
    const { saved } = await upgradeAndSave();

    expect([saved.header.versionMajor, saved.header.versionMinor]).toEqual([4, 0]);
    const params = saved.header.kdfParameters!;
    expect(ByteUtils.bytesToBase64(params.get("$UUID") as ArrayBuffer)).toBe(Consts.KdfId.Argon2id);
    expect((params.get("M") as Int64).value).toBe(DEFAULT_KDF.memoryBytes);
    expect((params.get("I") as Int64).value).toBe(DEFAULT_KDF.iterations);
    expect(params.get("P")).toBe(DEFAULT_KDF.parallelism);
    expect(saved.header.keyEncryptionRounds).toBeUndefined();
    expect(textualDateElements(saved)).toEqual([]);
  });

  it("keeps every group, entry, attachment, history revision and meta setting", async () => {
    const { original, saved } = await upgradeAndSave();

    const before = snapshotVault(original);
    const after = snapshotVault(saved);
    expect({ ...after, header: undefined }).toEqual({ ...before, header: undefined });
    // KeePass's cipher choice isn't the upgrade's to change.
    expect(after.header.dataCipherUuid).toBe(before.header.dataCipherUuid);
    expect(after.header.compression).toBe(before.header.compression);
    const everything = after.entries[findEntry(original, "Everything Entry").uuid.id];
    expect(Object.keys(everything.binaries)).toEqual(["photo.bin", "secret.txt"]);
  });

  it("leaves a KDBX 4 vault's format and KDF alone", async () => {
    const bytes = readKeePassFixture("kdbx4-argon2id.kdbx");
    const session = await new KdbxVaultRepository().openVault(bytes, {
      password: KEEPASS_FIXTURE_PASSWORD,
    });

    session.upgradeFormat();
    const saved = await loadRaw(await session.save(session.vault));

    expect(session.format).toEqual({ major: 4, minor: 1 });
    expect(snapshotVault(saved).header).toEqual(snapshotVault(await loadRaw(bytes)).header);
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
