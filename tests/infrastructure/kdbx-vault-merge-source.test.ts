// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Credentials, Kdbx, ProtectedValue } from "kdbxweb";
import { FileStorage } from "../../src/application/file-storage";
import { VaultFileDialog } from "../../src/application/vault-file-dialog";
import { configureKdbxCrypto } from "../../src/infrastructure/kdbx-crypto";
import { KdbxVaultMergeSource } from "../../src/infrastructure/kdbx-vault-merge-source";

const MASTER_PASSWORD = "correct horse battery staple";

async function createFixtureBytes(keyFile?: Uint8Array): Promise<ArrayBuffer> {
  configureKdbxCrypto();
  const db = Kdbx.create(
    new Credentials(ProtectedValue.fromString(MASTER_PASSWORD), keyFile),
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
    pickKeyFile: vi.fn(),
    pickPathForNewKeyFile: vi.fn(),
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
    removeFile: vi.fn(),
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

  it("returns the chosen key file path from the key file dialog", async () => {
    const dialog = fakeDialog({ pickKeyFile: vi.fn().mockResolvedValue("C:/keys/other.keyx") });
    const source = new KdbxVaultMergeSource(dialog, fakeFileStorage());

    expect(await source.pickKeyFile()).toBe("C:/keys/other.keyx");
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

  it("reads the key file too when one is given, and unlocks with it", async () => {
    const keyFile = await Credentials.createRandomKeyFile(2);
    const bytes = await createFixtureBytes(keyFile);
    const files: Record<string, ArrayBuffer> = {
      "C:/vaults/other.kdbx": bytes,
      "C:/keys/other.keyx": keyFile.slice().buffer,
    };
    const fileStorage = fakeFileStorage({
      readFile: vi.fn((path: string) => Promise.resolve(files[path])),
    });
    const source = new KdbxVaultMergeSource(fakeDialog(), fileStorage);

    const vault = await source.openFile(
      "C:/vaults/other.kdbx",
      MASTER_PASSWORD,
      "C:/keys/other.keyx",
    );

    expect(fileStorage.readFile).toHaveBeenCalledWith("C:/keys/other.keyx");
    expect(vault.name).toBe("Source Vault");
  });

  it("propagates a wrong-password rejection instead of returning a vault", async () => {
    const bytes = await createFixtureBytes();
    const fileStorage = fakeFileStorage({ readFile: vi.fn().mockResolvedValue(bytes) });
    const source = new KdbxVaultMergeSource(fakeDialog(), fileStorage);

    await expect(source.openFile("C:/vaults/other.kdbx", "wrong password")).rejects.toThrow();
  });
});
