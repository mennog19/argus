// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Credentials, Kdbx, ProtectedValue } from "kdbxweb";
import { CustomField, CustomFields, Password, Vault } from "../domain";
import { configureKdbxCrypto } from "./kdbx-crypto";
import { KdbxVaultRepository } from "./kdbx-vault-repository";

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

    const vault = await repository.openVault(bytes, MASTER_PASSWORD);

    expect(vault.name).toBe("Fixture Vault");
    expect(vault.rootGroup.entries.map((e) => e.title).sort()).toEqual([
      "Untouched Site",
      "Will Change",
    ]);
    const subGroup = vault.rootGroup.groups.find((g) => g.name === "Sub Group");
    expect(subGroup?.entries[0].title).toBe("Nested Entry");
  });

  it("rejects opening with the wrong master password", async () => {
    const bytes = await createFixtureBytes();
    const repository = new KdbxVaultRepository();

    await expect(repository.openVault(bytes, "wrong password")).rejects.toThrow();
  });

  it("throws when saveVault is called before openVault", async () => {
    const repository = new KdbxVaultRepository();

    await expect(repository.saveVault(Vault.create("Unopened"))).rejects.toThrow(
      "No vault is open; call openVault before saveVault",
    );
  });

  it("round-trips edits while preserving untouched fields the domain model doesn't expose", async () => {
    const bytes = await createFixtureBytes();
    const repository = new KdbxVaultRepository();
    const vault = await repository.openVault(bytes, MASTER_PASSWORD);

    const willChange = vault.rootGroup.entries.find((e) => e.title === "Will Change")!;

    const updated = willChange.update({
      password: new Password("new-password"),
      customFields: new CustomFields([new CustomField("2FA", "enabled", true)]),
    });
    const updatedVault = vault.updateEntry(updated);

    const savedBytes = await repository.saveVault(updatedVault);

    const reopened = await new KdbxVaultRepository().openVault(savedBytes, MASTER_PASSWORD);

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

  it("creates a brand-new vault that can be saved and reopened", async () => {
    const repository = new KdbxVaultRepository();

    const vault = await repository.createVault("Brand New Vault", MASTER_PASSWORD);

    expect(vault.name).toBe("Brand New Vault");
    expect(vault.rootGroup.entries).toEqual([]);

    const savedBytes = await repository.saveVault(vault);
    const reopened = await new KdbxVaultRepository().openVault(savedBytes, MASTER_PASSWORD);
    expect(reopened.name).toBe("Brand New Vault");
  });
});
