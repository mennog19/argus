// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ByteUtils,
  Consts,
  Credentials,
  Int64,
  Kdbx,
  ProtectedValue,
  VarDictionary,
} from "kdbxweb";
import { DEFAULT_KDF, VaultSettings } from "../../src/application/vault-settings";
import { CustomField, CustomFields, Password } from "../../src/domain";
import { configureKdbxCrypto } from "../../src/infrastructure/kdbx-crypto";
import { KdbxVaultRepository } from "../../src/infrastructure/kdbx-vault-repository";
import { KEEPASS_FIXTURE_PASSWORD, readKeePassFixture } from "./keepass-fixtures";

const MASTER_PASSWORD = "correct horse battery staple";

async function createFixtureBytes(): Promise<ArrayBuffer> {
  configureKdbxCrypto();
  const db = Kdbx.create(
    new Credentials(ProtectedValue.fromString(MASTER_PASSWORD)),
    "Fixture Vault",
  );
  const root = db.getDefaultGroup();

  const untouched = db.createEntry(root);
  untouched.fields.set("Title", "Untouched Site");
  untouched.fields.set("UserName", "someone");
  untouched.fields.set("Password", ProtectedValue.fromString("original-secret"));
  untouched.icon = 12;
  untouched.fields.set("Recovery Codes", "1111-2222");

  const willChange = db.createEntry(root);
  willChange.fields.set("Title", "Will Change");
  willChange.fields.set("Password", ProtectedValue.fromString("old-password"));

  const subGroup = db.createGroup(root, "Sub Group");
  const nested = db.createEntry(subGroup);
  nested.fields.set("Title", "Nested Entry");

  return db.save();
}

/**
 * A vault keyed the way KeePassXC keys one with a key file: `password` null
 * means key-file-only, with no password part in the composite key at all.
 */
async function createKeyFileFixtureBytes(
  password: string | null,
  keyFile: Uint8Array,
): Promise<ArrayBuffer> {
  configureKdbxCrypto();
  const passwordPart = password === null ? null : ProtectedValue.fromString(password);
  return Kdbx.create(new Credentials(passwordPart, keyFile), "Key File Vault").save();
}

/** A standalone copy, the way `FileStorage.readFile` hands file contents over. */
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

describe("KdbxVaultRepository", () => {
  it("opens a real kdbx4/argon2 file and maps its contents", async () => {
    const bytes = await createFixtureBytes();
    const repository = new KdbxVaultRepository();

    const session = await repository.openVault(bytes, { password: MASTER_PASSWORD });

    expect(session.vault.name).toBe("Fixture Vault");
    expect(session.vault.rootGroup.entries.map((e) => e.title).sort()).toEqual([
      "Untouched Site",
      "Will Change",
    ]);
    const subGroup = session.vault.rootGroup.groups.find((g) => g.name === "Sub Group");
    expect(subGroup?.entries[0].title).toBe("Nested Entry");
  });

  it("rejects opening with the wrong master password", async () => {
    const bytes = await createFixtureBytes();
    const repository = new KdbxVaultRepository();

    await expect(repository.openVault(bytes, { password: "wrong password" })).rejects.toThrow(
      "Incorrect password",
    );
  });

  it("passes other load failures through rather than calling them a wrong password", async () => {
    const notAVault = new TextEncoder().encode("not a kdbx file").buffer;
    const repository = new KdbxVaultRepository();

    const failure = repository.openVault(notAVault, { password: MASTER_PASSWORD });

    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toThrow("Incorrect password");
  });

  it("round-trips edits while preserving untouched fields the domain model doesn't expose", async () => {
    const bytes = await createFixtureBytes();
    const repository = new KdbxVaultRepository();
    const session = await repository.openVault(bytes, { password: MASTER_PASSWORD });

    const willChange = session.vault.rootGroup.entries.find((e) => e.title === "Will Change")!;

    const updated = willChange.update({
      password: new Password("New-password1"),
      customFields: new CustomFields([new CustomField("2FA", "enabled", true)]),
    });
    const updatedVault = session.vault.updateEntry(updated);

    const savedBytes = await session.save(updatedVault);

    const reopened = (
      await new KdbxVaultRepository().openVault(savedBytes, { password: MASTER_PASSWORD })
    ).vault;

    const reopenedUntouched = reopened.rootGroup.entries.find((e) => e.title === "Untouched Site")!;
    expect(reopenedUntouched.username).toBe("someone");
    expect(reopenedUntouched.password.reveal()).toBe("original-secret");
    expect(reopenedUntouched.customFields.get("Recovery Codes")?.value).toBe("1111-2222");

    const reopenedChanged = reopened.rootGroup.entries.find((e) => e.title === "Will Change")!;
    expect(reopenedChanged.password.reveal()).toBe("New-password1");
    expect(reopenedChanged.customFields.get("2FA")?.value).toBe("enabled");

    // Confirm the untouched KdbxEntry object's icon (a field the domain model
    // doesn't expose at all) survived the round trip byte-for-byte.
    const rawReloaded = await Kdbx.load(
      savedBytes,
      new Credentials(ProtectedValue.fromString(MASTER_PASSWORD)),
    );
    const rawUntouched = rawReloaded
      .getDefaultGroup()
      .entries.find((e) => e.fields.get("Title") === "Untouched Site");
    expect(rawUntouched?.icon).toBe(12);
  });

  it("round-trips an emptied recycle bin without the deleted items remaining in the saved file", async () => {
    const bytes = await createFixtureBytes();
    const session = await new KdbxVaultRepository().openVault(bytes, { password: MASTER_PASSWORD });

    const willChange = session.vault.rootGroup.entries.find((e) => e.title === "Will Change")!;
    const subGroup = session.vault.rootGroup.groups.find((g) => g.name === "Sub Group")!;
    const binnedBytes = await session.save(
      session.vault.deleteEntry(willChange.id).deleteGroup(subGroup.id),
    );

    const binnedSession = await new KdbxVaultRepository().openVault(binnedBytes, {
      password: MASTER_PASSWORD,
    });
    expect(binnedSession.vault.recycleBin?.entries.map((e) => e.title)).toEqual(["Will Change"]);
    const emptiedBytes = await binnedSession.save(binnedSession.vault.emptyRecycleBin());

    const reopened = (
      await new KdbxVaultRepository().openVault(emptiedBytes, { password: MASTER_PASSWORD })
    ).vault;
    expect(reopened.recycleBin?.entries).toEqual([]);
    expect(reopened.recycleBin?.groups).toEqual([]);

    const raw = await Kdbx.load(
      emptiedBytes,
      new Credentials(ProtectedValue.fromString(MASTER_PASSWORD)),
    );
    const root = raw.getDefaultGroup();
    expect([...root.allEntries()].map((e) => e.fields.get("Title"))).toEqual(["Untouched Site"]);
    expect([...root.allGroups()].map((g) => g.name)).not.toContain("Sub Group");
    // "Will Change", "Sub Group" and "Nested Entry" are recorded as deleted so
    // KeePass-style sync doesn't resurrect them from another copy of the file.
    expect(raw.deletedObjects).toHaveLength(3);
  });

  it("creates a brand-new vault that can be saved and reopened", async () => {
    const repository = new KdbxVaultRepository();

    const session = await repository.createVault("Brand New Vault", { password: MASTER_PASSWORD });

    expect(session.vault.name).toBe("Brand New Vault");
    expect(session.vault.rootGroup.entries).toEqual([]);

    const savedBytes = await session.save(session.vault);
    const reopened = (
      await new KdbxVaultRepository().openVault(savedBytes, { password: MASTER_PASSWORD })
    ).vault;
    expect(reopened.name).toBe("Brand New Vault");
  });

  it("creates a vault that needs its generated key file as well as the password", async () => {
    const repository = new KdbxVaultRepository();
    const keyFile = await repository.generateKeyFile();

    const session = await repository.createVault("Keyed", {
      password: MASTER_PASSWORD,
      keyFile,
    });
    const savedBytes = await session.save(session.vault);

    await expect(
      new KdbxVaultRepository().openVault(savedBytes, { password: MASTER_PASSWORD }),
    ).rejects.toThrow("Incorrect password");
    // Opened straight through kdbxweb rather than the repository, the way any
    // other KeePass client would read the pair of files.
    const raw = await Kdbx.load(
      savedBytes,
      new Credentials(ProtectedValue.fromString(MASTER_PASSWORD), keyFile),
    );
    expect(raw.meta.name).toBe("Keyed");
  });

  it("generates a fresh KeePassXC-format XML key file each time", async () => {
    const repository = new KdbxVaultRepository();

    const first = new TextDecoder().decode(await repository.generateKeyFile());
    const second = new TextDecoder().decode(await repository.generateKeyFile());

    expect(first).toContain("<KeyFile>");
    expect(first).toContain("<Version>2.0</Version>");
    expect(first).not.toBe(second);
  });

  it("creates new vaults with Argon2id at DEFAULT_KDF strength, not kdbxweb's weak defaults", async () => {
    const session = await new KdbxVaultRepository().createVault("Vault", {
      password: MASTER_PASSWORD,
    });
    const savedBytes = await session.save(session.vault);

    const raw = await Kdbx.load(
      savedBytes,
      new Credentials(ProtectedValue.fromString(MASTER_PASSWORD)),
    );
    const params = raw.header.kdfParameters!;
    expect(ByteUtils.bytesToBase64(params.get("$UUID") as ArrayBuffer)).toBe(Consts.KdfId.Argon2id);
    expect((params.get("M") as Int64).value).toBe(64 * 1024 * 1024);
    expect((params.get("I") as Int64).value).toBe(4);
    expect(params.get("P")).toBe(2);
    expect(DEFAULT_KDF).toEqual({ memoryBytes: 64 * 1024 * 1024, iterations: 4, parallelism: 2 });
  });

  describe("changeMasterPassword", () => {
    it("re-keys the vault so it can only be reopened with the new password", async () => {
      const bytes = await createFixtureBytes();
      const repository = new KdbxVaultRepository();
      const session = await repository.openVault(bytes, { password: MASTER_PASSWORD });

      await session.changeMasterPassword(MASTER_PASSWORD, "new master password");
      const savedBytes = await session.save(session.vault);

      await expect(
        new KdbxVaultRepository().openVault(savedBytes, { password: MASTER_PASSWORD }),
      ).rejects.toThrow();
      const reopened = (
        await new KdbxVaultRepository().openVault(savedBytes, { password: "new master password" })
      ).vault;
      expect(reopened.name).toBe("Fixture Vault");
    });

    it("rejects with IncorrectMasterPasswordError when the current password is wrong", async () => {
      const bytes = await createFixtureBytes();
      const repository = new KdbxVaultRepository();
      const session = await repository.openVault(bytes, { password: MASTER_PASSWORD });

      await expect(
        session.changeMasterPassword("wrong password", "new master password"),
      ).rejects.toThrow("Current password is incorrect.");
    });
  });

  describe("rekeyFile", () => {
    it("re-encrypts a file so only the new password opens it, contents intact", async () => {
      const bytes = await createFixtureBytes();

      const rekeyed = await new KdbxVaultRepository().rekeyFile(
        bytes,
        { password: MASTER_PASSWORD },
        { password: "new master password" },
      );

      await expect(
        new KdbxVaultRepository().openVault(rekeyed, { password: MASTER_PASSWORD }),
      ).rejects.toThrow("Incorrect password");
      const reopened = (
        await new KdbxVaultRepository().openVault(rekeyed, { password: "new master password" })
      ).vault;
      expect(reopened.name).toBe("Fixture Vault");
      expect(reopened.rootGroup.entries.map((e) => e.title).sort()).toEqual([
        "Untouched Site",
        "Will Change",
      ]);
    });

    it("rejects when the current password doesn't open the file", async () => {
      const bytes = await createFixtureBytes();

      await expect(
        new KdbxVaultRepository().rekeyFile(
          bytes,
          { password: "wrong password" },
          { password: "new master password" },
        ),
      ).rejects.toThrow("Incorrect password");
    });

    it("keeps the key file part of the key, replacing only the password", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const bytes = await createKeyFileFixtureBytes(MASTER_PASSWORD, keyFile);

      const rekeyed = await new KdbxVaultRepository().rekeyFile(
        bytes,
        { password: MASTER_PASSWORD, keyFile: bufferOf(keyFile) },
        { password: "new master password", keyFile: bufferOf(keyFile) },
      );

      await expect(
        new KdbxVaultRepository().openVault(rekeyed, { password: "new master password" }),
      ).rejects.toThrow("Incorrect password");
      const reopened = await new KdbxVaultRepository().openVault(rekeyed, {
        password: "new master password",
        keyFile: bufferOf(keyFile),
      });
      expect(reopened.vault.name).toBe("Key File Vault");
    });
  });

  describe("rekeyFile with a different key file", () => {
    it("moves a file from one key file to another", async () => {
      const oldKeyFile = await Credentials.createRandomKeyFile(2);
      const newKeyFile = await Credentials.createRandomKeyFile(2);
      const bytes = await createKeyFileFixtureBytes(MASTER_PASSWORD, oldKeyFile);

      const rekeyed = await new KdbxVaultRepository().rekeyFile(
        bytes,
        { password: MASTER_PASSWORD, keyFile: bufferOf(oldKeyFile) },
        { password: MASTER_PASSWORD, keyFile: bufferOf(newKeyFile) },
      );

      await expect(
        new KdbxVaultRepository().openVault(rekeyed, {
          password: MASTER_PASSWORD,
          keyFile: bufferOf(oldKeyFile),
        }),
      ).rejects.toThrow("Incorrect password or key file.");
      const reopened = await new KdbxVaultRepository().openVault(rekeyed, {
        password: MASTER_PASSWORD,
        keyFile: bufferOf(newKeyFile),
      });
      expect(reopened.vault.name).toBe("Key File Vault");
    });

    it("drops the key file when the new key has none", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const bytes = await createKeyFileFixtureBytes(MASTER_PASSWORD, keyFile);

      const rekeyed = await new KdbxVaultRepository().rekeyFile(
        bytes,
        { password: MASTER_PASSWORD, keyFile: bufferOf(keyFile) },
        { password: MASTER_PASSWORD },
      );

      const reopened = await new KdbxVaultRepository().openVault(rekeyed, {
        password: MASTER_PASSWORD,
      });
      expect(reopened.vault.name).toBe("Key File Vault");
    });
  });

  describe("changeKeyFile", () => {
    it("adds a key file to a password-only vault", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const session = await new KdbxVaultRepository().openVault(await createFixtureBytes(), {
        password: MASTER_PASSWORD,
      });

      await session.changeKeyFile(MASTER_PASSWORD, bufferOf(keyFile));
      const savedBytes = await session.save(session.vault);

      await expect(
        new KdbxVaultRepository().openVault(savedBytes, { password: MASTER_PASSWORD }),
      ).rejects.toThrow("Incorrect password");
      const reopened = await new KdbxVaultRepository().openVault(savedBytes, {
        password: MASTER_PASSWORD,
        keyFile: bufferOf(keyFile),
      });
      expect(reopened.vault.name).toBe("Fixture Vault");
    });

    it("replaces one key file with another", async () => {
      const oldKeyFile = await Credentials.createRandomKeyFile(2);
      const newKeyFile = new TextEncoder().encode("any file at all can be a key file");
      const session = await new KdbxVaultRepository().openVault(
        await createKeyFileFixtureBytes(MASTER_PASSWORD, oldKeyFile),
        { password: MASTER_PASSWORD, keyFile: bufferOf(oldKeyFile) },
      );

      await session.changeKeyFile(MASTER_PASSWORD, bufferOf(newKeyFile));
      const savedBytes = await session.save(session.vault);

      await expect(
        new KdbxVaultRepository().openVault(savedBytes, {
          password: MASTER_PASSWORD,
          keyFile: bufferOf(oldKeyFile),
        }),
      ).rejects.toThrow("Incorrect password or key file.");
      const reopened = await new KdbxVaultRepository().openVault(savedBytes, {
        password: MASTER_PASSWORD,
        keyFile: bufferOf(newKeyFile),
      });
      expect(reopened.vault.name).toBe("Key File Vault");
    });

    it("removes the key file, leaving the password as the whole key", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const session = await new KdbxVaultRepository().openVault(
        await createKeyFileFixtureBytes(MASTER_PASSWORD, keyFile),
        { password: MASTER_PASSWORD, keyFile: bufferOf(keyFile) },
      );

      await session.changeKeyFile(MASTER_PASSWORD, undefined);
      const savedBytes = await session.save(session.vault);

      const reopened = await new KdbxVaultRepository().openVault(savedBytes, {
        password: MASTER_PASSWORD,
      });
      expect(reopened.vault.name).toBe("Key File Vault");
    });

    it("rejects with IncorrectMasterPasswordError when the current password is wrong", async () => {
      const session = await new KdbxVaultRepository().openVault(await createFixtureBytes(), {
        password: MASTER_PASSWORD,
      });

      await expect(session.changeKeyFile("wrong", new ArrayBuffer(32))).rejects.toThrow(
        "Current password is incorrect.",
      );
    });

    it("won't remove the key file of a vault that has no master password", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const session = await new KdbxVaultRepository().openVault(
        await createKeyFileFixtureBytes(null, keyFile),
        { password: "", keyFile: bufferOf(keyFile) },
      );

      await expect(session.changeKeyFile("", undefined)).rejects.toThrow(
        "Set a master password before removing the key file.",
      );
      // Replacing it is fine: the vault still ends up with a key.
      await expect(session.changeKeyFile("", new ArrayBuffer(32))).resolves.toBeUndefined();
    });

    it("rejects a key file that claims a key-file format but is malformed", async () => {
      const session = await new KdbxVaultRepository().openVault(await createFixtureBytes(), {
        password: MASTER_PASSWORD,
      });
      const malformed = new TextEncoder().encode(
        "<KeyFile><Meta><Version>9.0</Version></Meta><Key><Data>AA==</Data></Key></KeyFile>",
      );

      await expect(session.changeKeyFile(MASTER_PASSWORD, bufferOf(malformed))).rejects.toThrow(
        "That key file couldn't be read. Is it the right file?",
      );
      // The vault still opens the way it did.
      const savedBytes = await session.save(session.vault);
      await expect(
        new KdbxVaultRepository().openVault(savedBytes, { password: MASTER_PASSWORD }),
      ).resolves.toBeDefined();
    });
  });

  describe("settings", () => {
    const MIB = 1024 * 1024;

    it("reports a new vault's history limits and Argon2id settings", async () => {
      const session = await new KdbxVaultRepository().createVault("New", {
        password: MASTER_PASSWORD,
      });

      expect(session.settings).toEqual({
        historyMaxItems: 10,
        historyMaxSizeBytes: 6 * MIB,
        kdf: { kind: "argon2id", ...DEFAULT_KDF },
      });
    });

    it("reports a KDBX 3 file's AES-KDF rounds", async () => {
      const session = await new KdbxVaultRepository().openVault(
        readKeePassFixture("kdbx3-aes.kdbx"),
        { password: KEEPASS_FIXTURE_PASSWORD },
      );

      expect(session.settings.kdf).toEqual({ kind: "aes", rounds: expect.any(Number) });
      expect(Number((session.settings.kdf as { rounds: number }).rounds)).toBeGreaterThan(0);
    });

    it("reports limits a file leaves out as KeePass's defaults, and negative ones as unlimited", async () => {
      configureKdbxCrypto();
      const db = Kdbx.create(new Credentials(ProtectedValue.fromString(MASTER_PASSWORD)), "V");
      db.meta.historyMaxItems = undefined;
      db.meta.historyMaxSize = -1;
      db.setKdf(Consts.KdfId.Argon2d);

      const session = await new KdbxVaultRepository().openVault(await db.save(), {
        password: MASTER_PASSWORD,
      });

      expect(session.settings.historyMaxItems).toBe(10);
      expect(session.settings.historyMaxSizeBytes).toBeUndefined();
      expect(session.settings.kdf.kind).toBe("argon2d");
    });

    it("saves changed history limits and Argon2 settings into the file", async () => {
      const session = await new KdbxVaultRepository().createVault("New", {
        password: MASTER_PASSWORD,
      });
      const next: VaultSettings = {
        historyMaxItems: undefined,
        historyMaxSizeBytes: 2 * MIB,
        kdf: { kind: "argon2d", memoryBytes: 16 * MIB, iterations: 3, parallelism: 1 },
      };

      session.applySettings(next);
      expect(session.settings).toEqual(next);
      const savedBytes = await session.save(session.vault);

      const reopened = await new KdbxVaultRepository().openVault(savedBytes, {
        password: MASTER_PASSWORD,
      });
      expect(reopened.settings).toEqual(next);
      const raw = await Kdbx.load(
        savedBytes,
        new Credentials(ProtectedValue.fromString(MASTER_PASSWORD)),
      );
      expect(raw.meta.historyMaxItems).toBe(-1);
    });

    it("moves a KDBX 4 vault between AES-KDF and Argon2", async () => {
      const session = await new KdbxVaultRepository().createVault("New", {
        password: MASTER_PASSWORD,
      });

      session.applySettings({ ...session.settings, kdf: { kind: "aes", rounds: 1234 } });
      const asAes = await new KdbxVaultRepository().openVault(await session.save(session.vault), {
        password: MASTER_PASSWORD,
      });
      expect(asAes.settings.kdf).toEqual({ kind: "aes", rounds: 1234 });

      asAes.applySettings({ ...asAes.settings, kdf: { kind: "aes", rounds: 4321 } });
      expect(asAes.settings.kdf).toEqual({ kind: "aes", rounds: 4321 });

      asAes.applySettings({ ...asAes.settings, kdf: { kind: "argon2id", ...DEFAULT_KDF } });
      const asArgon = await new KdbxVaultRepository().openVault(await asAes.save(asAes.vault), {
        password: MASTER_PASSWORD,
      });
      expect(asArgon.settings.kdf).toEqual({ kind: "argon2id", ...DEFAULT_KDF });
    });

    it("changes a KDBX 3 vault's rounds, and still opens it", async () => {
      const session = await new KdbxVaultRepository().openVault(
        readKeePassFixture("kdbx3-aes.kdbx"),
        { password: KEEPASS_FIXTURE_PASSWORD },
      );

      session.applySettings({ ...session.settings, kdf: { kind: "aes", rounds: 7000 } });
      const savedBytes = await session.save(session.vault);

      const reopened = await new KdbxVaultRepository().openVault(savedBytes, {
        password: KEEPASS_FIXTURE_PASSWORD,
      });
      expect(reopened.format.major).toBe(3);
      expect(reopened.settings.kdf).toEqual({ kind: "aes", rounds: 7000 });
    });

    it("won't give a KDBX 3 vault Argon2, which that format doesn't have", async () => {
      const session = await new KdbxVaultRepository().openVault(
        readKeePassFixture("kdbx3-aes.kdbx"),
        { password: KEEPASS_FIXTURE_PASSWORD },
      );

      expect(() =>
        session.applySettings({ ...session.settings, kdf: { kind: "argon2id", ...DEFAULT_KDF } }),
      ).toThrow("A KDBX 3 vault can only use AES-KDF.");
    });

    it("refuses settings Argus wouldn't unlock again, leaving the vault as it was", async () => {
      const session = await new KdbxVaultRepository().createVault("New", {
        password: MASTER_PASSWORD,
      });
      const before = session.settings;

      expect(() =>
        session.applySettings({
          ...before,
          historyMaxItems: 3,
          kdf: { kind: "argon2id", ...DEFAULT_KDF, iterations: 1001 },
        }),
      ).toThrow("Iterations must be between 1 and 1000.");
      expect(session.settings).toEqual(before);
    });
  });

  describe("AES-KDF limit", () => {
    it("refuses a file asking for more rounds than Argus will run, before trying the key", async () => {
      configureKdbxCrypto();
      const db = Kdbx.create(new Credentials(ProtectedValue.fromString(MASTER_PASSWORD)), "V");
      db.setKdf(Consts.KdfId.Aes);
      db.header.kdfParameters!.set("R", VarDictionary.ValueType.UInt64, new Int64(1));
      const bytes = new Uint8Array(await db.save());
      // Patch the saved header in place: saving with the real count would take forever.
      const view = new DataView(bytes.buffer);
      const marker = [0x05, 0x01, 0x00, 0x00, 0x00, 0x52, 0x08, 0x00, 0x00, 0x00];
      const at = bytes.findIndex((_, i) => marker.every((byte, j) => bytes[i + j] === byte));
      view.setBigUint64(at + marker.length, 2n ** 60n, true);

      const repository = new KdbxVaultRepository();
      await expect(repository.openVault(bytes.buffer, { password: "whatever" })).rejects.toThrow(
        "AES-KDF rounds to unlock",
      );
      await expect(
        repository.rekeyFile(bytes.buffer, { password: "whatever" }, { password: "new" }),
      ).rejects.toThrow("AES-KDF rounds to unlock");
    });
  });

  describe("key files", () => {
    it("opens a vault that needs both a password and a KeePassXC-style XML key file", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const bytes = await createKeyFileFixtureBytes(MASTER_PASSWORD, keyFile);

      const session = await new KdbxVaultRepository().openVault(bytes, {
        password: MASTER_PASSWORD,
        keyFile: bufferOf(keyFile),
      });

      expect(session.vault.name).toBe("Key File Vault");
    });

    it("opens a vault whose key file is an arbitrary file rather than a key-file format", async () => {
      const keyFile = new TextEncoder().encode("a photo, a PDF, anything at all");
      const bytes = await createKeyFileFixtureBytes(MASTER_PASSWORD, keyFile);

      const session = await new KdbxVaultRepository().openVault(bytes, {
        password: MASTER_PASSWORD,
        keyFile: bufferOf(keyFile),
      });

      expect(session.vault.name).toBe("Key File Vault");
    });

    it("opens a key-file-only vault when the password is left empty", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const bytes = await createKeyFileFixtureBytes(null, keyFile);

      const session = await new KdbxVaultRepository().openVault(bytes, {
        password: "",
        keyFile: bufferOf(keyFile),
      });

      expect(session.vault.name).toBe("Key File Vault");
    });

    it("hints at a key file when a vault that needs one is opened without it", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const bytes = await createKeyFileFixtureBytes(MASTER_PASSWORD, keyFile);

      await expect(
        new KdbxVaultRepository().openVault(bytes, { password: MASTER_PASSWORD }),
      ).rejects.toThrow("Incorrect password. If this vault uses a key file, choose it as well.");
    });

    it("blames the password or key file when the wrong key file is given", async () => {
      const bytes = await createKeyFileFixtureBytes(
        MASTER_PASSWORD,
        await Credentials.createRandomKeyFile(2),
      );
      const otherKeyFile = await Credentials.createRandomKeyFile(2);

      await expect(
        new KdbxVaultRepository().openVault(bytes, {
          password: MASTER_PASSWORD,
          keyFile: bufferOf(otherKeyFile),
        }),
      ).rejects.toThrow("Incorrect password or key file.");
    });

    it("rejects a key file that claims a key-file format but is malformed", async () => {
      const bytes = await createFixtureBytes();
      const malformed = new TextEncoder().encode(
        "<KeyFile><Meta><Version>9.0</Version></Meta><Key><Data>AA==</Data></Key></KeyFile>",
      );

      await expect(
        new KdbxVaultRepository().openVault(bytes, {
          password: MASTER_PASSWORD,
          keyFile: bufferOf(malformed),
        }),
      ).rejects.toThrow("That key file couldn't be read. Is it the right file?");
    });

    it("keeps the key file when the master password changes", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const bytes = await createKeyFileFixtureBytes(MASTER_PASSWORD, keyFile);
      const session = await new KdbxVaultRepository().openVault(bytes, {
        password: MASTER_PASSWORD,
        keyFile: bufferOf(keyFile),
      });

      await session.changeMasterPassword(MASTER_PASSWORD, "new master password");
      const savedBytes = await session.save(session.vault);

      await expect(
        new KdbxVaultRepository().openVault(savedBytes, { password: "new master password" }),
      ).rejects.toThrow("Incorrect password");
      const reopened = await new KdbxVaultRepository().openVault(savedBytes, {
        password: "new master password",
        keyFile: bufferOf(keyFile),
      });
      expect(reopened.vault.name).toBe("Key File Vault");
    });

    it("treats a key-file-only vault's current password as the empty one", async () => {
      const keyFile = await Credentials.createRandomKeyFile(2);
      const bytes = await createKeyFileFixtureBytes(null, keyFile);
      const session = await new KdbxVaultRepository().openVault(bytes, {
        password: "",
        keyFile: bufferOf(keyFile),
      });

      await expect(session.changeMasterPassword("anything", "new master password")).rejects.toThrow(
        "Current password is incorrect.",
      );
      await session.changeMasterPassword("", "new master password");
      const savedBytes = await session.save(session.vault);

      const reopened = await new KdbxVaultRepository().openVault(savedBytes, {
        password: "new master password",
        keyFile: bufferOf(keyFile),
      });
      expect(reopened.vault.name).toBe("Key File Vault");
    });
  });
});
