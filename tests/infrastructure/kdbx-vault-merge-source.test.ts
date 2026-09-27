// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Credentials, Kdbx, ProtectedValue } from "kdbxweb";
import { FileStorage } from "../application/file-storage";
import { VaultFileDialog } from "../application/vault-file-dialog";
import { configureKdbxCrypto } from "./kdbx-crypto";
import { KdbxVaultMergeSource } from "./kdbx-vault-merge-source";

const MASTER_PASSWORD = "correct horse battery staple";

async function createFixtureBytes(): Promise<ArrayBuffer> {
  configureKdbxCrypto();
  const db = Kdbx.create(
    new Credentials(ProtectedValue.fromString(MASTER_PASSWORD)),
    "Source Vault",
  );
  const entry = db.createEntry(db.getDefaultGroup());
  entry.fields.set("Title", "Imported Site");
  return db.save();
}

function fakeDialog(overrides: Partial<VaultFileDialog> = {}): VaultFileDialog {
  return {
    pickVaultToOpen: vi.fn(),
    pickPathForNewVault: vi.fn(),
    ...overrides,
  };
}

function fakeFileStorage(overrides: Partial<FileStorage> = {}): FileStorage {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    exists: vi.fn(),
    lastModified: vi.fn(),
    size: vi.fn(),
    copyFile: vi.fn(),
    grantAccess: vi.fn(),
    ...overrides,
  };
}

describe("KdbxVaultMergeSource", () => {
  it("returns undefined when the user cancels the file dialog", async () => {
    const dialog = fakeDialog({ pickVaultToOpen: vi.fn().mockResolvedValue(undefined) });
    const fileStorage = fakeFileStorage();
    const source = new KdbxVaultMergeSource(dialog, fileStorage);

    expect(await source.pickFile()).toBeUndefined();
    expect(fileStorage.readFile).not.toHaveBeenCalled();
  });

  it("returns the chosen path from the file dialog", async () => {
    const dialog = fakeDialog({
      pickVaultToOpen: vi.fn().mockResolvedValue("C:/vaults/other.kdbx"),
    });
    const source = new KdbxVaultMergeSource(dialog, fakeFileStorage());

    expect(await source.pickFile()).toBe("C:/vaults/other.kdbx");
  });

  it("reads and decrypts the given file", async () => {
    const bytes = await createFixtureBytes();
    const fileStorage = fakeFileStorage({ readFile: vi.fn().mockResolvedValue(bytes) });
    const source = new KdbxVaultMergeSource(fakeDialog(), fileStorage);

    const vault = await source.openFile("C:/vaults/other.kdbx", MASTER_PASSWORD);

    expect(fileStorage.readFile).toHaveBeenCalledWith("C:/vaults/other.kdbx");
    expect(vault.name).toBe("Source Vault");
    expect(vault.rootGroup.entries[0]?.title).toBe("Imported Site");
  });

  it("propagates a wrong-password rejection instead of returning a vault", async () => {
    const bytes = await createFixtureBytes();
    const fileStorage = fakeFileStorage({ readFile: vi.fn().mockResolvedValue(bytes) });
    const source = new KdbxVaultMergeSource(fakeDialog(), fileStorage);

    await expect(source.openFile("C:/vaults/other.kdbx", "wrong password")).rejects.toThrow();
  });
});
