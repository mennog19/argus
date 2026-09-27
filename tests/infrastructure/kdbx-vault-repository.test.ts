// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ByteUtils, Consts, Credentials, Int64, Kdbx, ProtectedValue } from "kdbxweb";
import { CustomField, CustomFields, Password } from "../../src/domain";
import { configureKdbxCrypto } from "../../src/infrastructure/kdbx-crypto";
import { DEFAULT_KDF, KdbxVaultRepository } from "../../src/infrastructure/kdbx-vault-repository";

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

describe("KdbxVaultRepository", () => {
  it("opens a real kdbx4/argon2 file and maps its contents", async () => {
    const bytes = await createFixtureBytes();
    const repository = new KdbxVaultRepository();

    const session = await repository.openVault(bytes, MASTER_PASSWORD);

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

    await expect(repository.openVault(bytes, "wrong password")).rejects.toThrow();
  });

  it("round-trips edits while preserving untouched fields the domain model doesn't expose", async () => {
    const bytes = await createFixtureBytes();
    const repository = new KdbxVaultRepository();
    const session = await repository.openVault(bytes, MASTER_PASSWORD);

    const willChange = session.vault.rootGroup.entries.find((e) => e.title === "Will Change")!;

    const updated = willChange.update({
      password: new Password("new-password"),
      customFields: new CustomFields([new CustomField("2FA", "enabled", true)]),
    });
    const updatedVault = session.vault.updateEntry(updated);

    const savedBytes = await session.save(updatedVault);

    const reopened = (await new KdbxVaultRepository().openVault(savedBytes, MASTER_PASSWORD)).vault;

    const reopenedUntouched = reopened.rootGroup.entries.find((e) => e.title === "Untouched Site")!;
    expect(reopenedUntouched.username).toBe("someone");
    expect(reopenedUntouched.password.reveal()).toBe("original-secret");
    expect(reopenedUntouched.customFields.get("Recovery Codes")?.value).toBe("1111-2222");

    const reopenedChanged = reopened.rootGroup.entries.find((e) => e.title === "Will Change")!;
    expect(reopenedChanged.password.reveal()).toBe("new-password");
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
    const session = await new KdbxVaultRepository().openVault(bytes, MASTER_PASSWORD);

    const willChange = session.vault.rootGroup.entries.find((e) => e.title === "Will Change")!;
    const subGroup = session.vault.rootGroup.groups.find((g) => g.name === "Sub Group")!;
    const binnedBytes = await session.save(
      session.vault.deleteEntry(willChange.id).deleteGroup(subGroup.id),
    );

    const binnedSession = await new KdbxVaultRepository().openVault(binnedBytes, MASTER_PASSWORD);
    expect(binnedSession.vault.recycleBin?.entries.map((e) => e.title)).toEqual(["Will Change"]);
    const emptiedBytes = await binnedSession.save(binnedSession.vault.emptyRecycleBin());

    const reopened = (await new KdbxVaultRepository().openVault(emptiedBytes, MASTER_PASSWORD))
      .vault;
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

    const session = await repository.createVault("Brand New Vault", MASTER_PASSWORD);

    expect(session.vault.name).toBe("Brand New Vault");
    expect(session.vault.rootGroup.entries).toEqual([]);

    const savedBytes = await session.save(session.vault);
    const reopened = (await new KdbxVaultRepository().openVault(savedBytes, MASTER_PASSWORD)).vault;
    expect(reopened.name).toBe("Brand New Vault");
  });

  it("creates new vaults with Argon2id at DEFAULT_KDF strength, not kdbxweb's weak defaults", async () => {
    const session = await new KdbxVaultRepository().createVault("Vault", MASTER_PASSWORD);
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
      const session = await repository.openVault(bytes, MASTER_PASSWORD);

      await session.changeMasterPassword(MASTER_PASSWORD, "new master password");
      const savedBytes = await session.save(session.vault);

      await expect(
        new KdbxVaultRepository().openVault(savedBytes, MASTER_PASSWORD),
      ).rejects.toThrow();
      const reopened = (
        await new KdbxVaultRepository().openVault(savedBytes, "new master password")
      ).vault;
      expect(reopened.name).toBe("Fixture Vault");
    });

    it("rejects with IncorrectMasterPasswordError when the current password is wrong", async () => {
      const bytes = await createFixtureBytes();
      const repository = new KdbxVaultRepository();
      const session = await repository.openVault(bytes, MASTER_PASSWORD);

      await expect(
        session.changeMasterPassword("wrong password", "new master password"),
      ).rejects.toThrow("Current password is incorrect.");
    });
  });
});
