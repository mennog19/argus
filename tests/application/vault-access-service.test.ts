import { describe, expect, it, vi } from "vitest";
import { Vault } from "../../src/domain";
import { FileStorage } from "../../src/application/file-storage";
import { VaultFileDialog } from "../../src/application/vault-file-dialog";
import {
  VaultAccessService,
  VaultSaveConflictError,
} from "../../src/application/vault-access-service";
import { VaultKey, VaultRepository, VaultSession } from "../../src/application/vault-repository";

/**
 * A repository whose sessions delegate to one shared pair of mocks, so tests
 * can go on asserting "the repository saved" without assembling a session for
 * every case. `openVault`/`createVault` overrides still resolve to a `Vault`;
 * the wrapper puts it in a session.
 */
type OpenFake = (fileBytes: ArrayBuffer, key: VaultKey) => Promise<Vault>;
type CreateFake = (name: string, masterPassword: string) => Promise<Vault>;
type SaveFake = (vault: Vault) => Promise<ArrayBuffer>;
type RekeyFake = (currentMasterPassword: string, newMasterPassword: string) => Promise<void>;
type RekeyFileFake = (
  fileBytes: ArrayBuffer,
  currentKey: VaultKey,
  newMasterPassword: string,
) => Promise<ArrayBuffer>;

function fakeRepository(
  overrides: {
    openVault?: OpenFake;
    createVault?: CreateFake;
    saveVault?: SaveFake;
    changeMasterPassword?: RekeyFake;
    rekeyFile?: RekeyFileFake;
  } = {},
) {
  const saveVault = vi.fn<SaveFake>(overrides.saveVault ?? (() => Promise.resolve(emptyBytes())));
  const changeMasterPassword = vi.fn<RekeyFake>(
    overrides.changeMasterPassword ?? (() => Promise.resolve()),
  );
  const openVault = vi.fn<OpenFake>(overrides.openVault);
  const createVault = vi.fn<CreateFake>(overrides.createVault);
  const sessionFor = (vault: Vault): VaultSession => ({
    vault,
    save: saveVault,
    changeMasterPassword,
  });
  const repository = {
    openVault: vi.fn(async (fileBytes: ArrayBuffer, key: VaultKey) =>
      sessionFor(await openVault(fileBytes, key)),
    ),
    createVault: vi.fn(async (name: string, masterPassword: string) =>
      sessionFor(await createVault(name, masterPassword)),
    ),
    rekeyFile: vi.fn<RekeyFileFake>(overrides.rekeyFile ?? (() => Promise.resolve(emptyBytes()))),
  } satisfies VaultRepository;
  // Only the session's mocks are merged in: overwriting `openVault` here with
  // the raw override would bypass the wrapper that builds the session.
  return Object.assign(repository, { saveVault, changeMasterPassword });
}

function emptyBytes(): ArrayBuffer {
  return new ArrayBuffer(0);
}

/**
 * A service with a vault already open — the only state in which saving means
 * anything, since the save serializes the document the open produced.
 * `openedPath` defaults to the path the save tests write back to; pass a
 * different one to exercise "this service has never seen that file".
 */
async function serviceWithOpenVault(
  repository: VaultRepository,
  fileStorage: FileStorage,
  openedPath = "C:/vaults/mine.kdbx",
): Promise<VaultAccessService> {
  const service = new VaultAccessService(repository, fakeDialog(), fileStorage);
  await service.openVaultAtPath(openedPath, "master password");
  return service;
}

function fakeDialog(overrides: Partial<VaultFileDialog> = {}): VaultFileDialog {
  return {
    pickVaultToOpen: vi.fn(),
    pickPathForNewVault: vi.fn(),
    pickKeyFile: vi.fn(),
    ...overrides,
  };
}

function fakeFileStorage(overrides: Partial<FileStorage> = {}): FileStorage {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    exists: vi.fn().mockResolvedValue(false),
    lastModified: vi.fn().mockResolvedValue(0),
    size: vi.fn().mockResolvedValue(0),
    copyFile: vi.fn(),
    removeFile: vi.fn(),
    grantAccess: vi.fn(),
    ...overrides,
  };
}

describe("VaultAccessService", () => {
  describe("openExistingVault", () => {
    it("returns undefined when the user cancels the open dialog", async () => {
      const repository = fakeRepository();
      const dialog = fakeDialog({ pickVaultToOpen: vi.fn().mockResolvedValue(undefined) });
      const fileStorage = fakeFileStorage();
      const service = new VaultAccessService(repository, dialog, fileStorage);

      const result = await service.openExistingVault("master password");

      expect(result).toBeUndefined();
      expect(fileStorage.readFile).not.toHaveBeenCalled();
      expect(repository.openVault).not.toHaveBeenCalled();
    });

    it("reads the chosen file and opens it through the repository", async () => {
      const vault = Vault.create("My Vault");
      const fileBytes = new ArrayBuffer(4);
      const repository = fakeRepository({ openVault: vi.fn().mockResolvedValue(vault) });
      const dialog = fakeDialog({
        pickVaultToOpen: vi.fn().mockResolvedValue("C:/vaults/mine.kdbx"),
      });
      const fileStorage = fakeFileStorage({ readFile: vi.fn().mockResolvedValue(fileBytes) });
      const service = new VaultAccessService(repository, dialog, fileStorage);

      const result = await service.openExistingVault("master password");

      expect(fileStorage.readFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx");
      expect(repository.openVault).toHaveBeenCalledWith(fileBytes, { password: "master password" });
      expect(result).toEqual({ vault, filePath: "C:/vaults/mine.kdbx" });
    });

    it("unlocks the chosen file with the given key file as well", async () => {
      const keyFileBytes = new ArrayBuffer(32);
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(Vault.create("My Vault")),
      });
      const dialog = fakeDialog({
        pickVaultToOpen: vi.fn().mockResolvedValue("C:/vaults/mine.kdbx"),
      });
      const fileStorage = fakeFileStorage({ readFile: vi.fn().mockResolvedValue(keyFileBytes) });
      const service = new VaultAccessService(repository, dialog, fileStorage);

      const result = await service.openExistingVault("master password", "C:/keys/mine.keyx");

      expect(result?.keyFilePath).toBe("C:/keys/mine.keyx");
      expect(fileStorage.readFile).toHaveBeenCalledWith("C:/keys/mine.keyx");
      expect(repository.openVault).toHaveBeenCalledWith(keyFileBytes, {
        password: "master password",
        keyFile: keyFileBytes,
      });
    });
  });

  describe("createNewVault", () => {
    it("returns undefined when the user cancels the save dialog", async () => {
      const repository = fakeRepository();
      const dialog = fakeDialog({ pickPathForNewVault: vi.fn().mockResolvedValue(undefined) });
      const fileStorage = fakeFileStorage();
      const service = new VaultAccessService(repository, dialog, fileStorage);

      const result = await service.createNewVault("New Vault", "master password");

      expect(result).toBeUndefined();
      expect(repository.createVault).not.toHaveBeenCalled();
      expect(fileStorage.writeFile).not.toHaveBeenCalled();
    });

    it("creates the vault through the repository and writes it to the chosen path", async () => {
      const vault = Vault.create("New Vault");
      const fileBytes = new ArrayBuffer(4);
      const repository = fakeRepository({
        createVault: vi.fn().mockResolvedValue(vault),
        saveVault: vi.fn().mockResolvedValue(fileBytes),
      });
      const dialog = fakeDialog({
        pickPathForNewVault: vi.fn().mockResolvedValue("C:/vaults/new.kdbx"),
      });
      const fileStorage = fakeFileStorage();
      const service = new VaultAccessService(repository, dialog, fileStorage);

      const result = await service.createNewVault("New Vault", "master password");

      expect(repository.createVault).toHaveBeenCalledWith("New Vault", "master password");
      expect(repository.saveVault).toHaveBeenCalledWith(vault);
      expect(fileStorage.writeFile).toHaveBeenCalledWith("C:/vaults/new.kdbx", fileBytes);
      expect(result).toEqual({ vault, filePath: "C:/vaults/new.kdbx" });
    });
  });

  describe("openVaultAtPath", () => {
    it("reads the given path and opens it through the repository, without the dialog", async () => {
      const vault = Vault.create("My Vault");
      const fileBytes = new ArrayBuffer(4);
      const repository = fakeRepository({ openVault: vi.fn().mockResolvedValue(vault) });
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({ readFile: vi.fn().mockResolvedValue(fileBytes) });
      const service = new VaultAccessService(repository, dialog, fileStorage);

      const result = await service.openVaultAtPath("C:/vaults/mine.kdbx", "master password");

      expect(fileStorage.readFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx");
      expect(repository.openVault).toHaveBeenCalledWith(fileBytes, { password: "master password" });
      expect(dialog.pickVaultToOpen).not.toHaveBeenCalled();
      expect(result).toBe(vault);
    });

    it("propagates errors from the repository (e.g. wrong master password)", async () => {
      const repository = fakeRepository({
        openVault: vi.fn().mockRejectedValue(new Error("Invalid credentials")),
      });
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const service = new VaultAccessService(repository, dialog, fileStorage);

      await expect(service.openVaultAtPath("C:/vaults/mine.kdbx", "wrong")).rejects.toThrow(
        "Invalid credentials",
      );
    });

    it("reads the key file too when one is given, and unlocks with both", async () => {
      const fileBytes = new ArrayBuffer(4);
      const keyFileBytes = new ArrayBuffer(32);
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(Vault.create("My Vault")),
      });
      const fileStorage = fakeFileStorage({
        readFile: vi.fn((path: string) =>
          Promise.resolve(path.endsWith(".keyx") ? keyFileBytes : fileBytes),
        ),
      });
      const service = new VaultAccessService(repository, fakeDialog(), fileStorage);

      await service.openVaultAtPath("C:/vaults/mine.kdbx", "master password", "C:/keys/mine.keyx");

      expect(fileStorage.readFile).toHaveBeenCalledWith("C:/keys/mine.keyx");
      expect(repository.openVault).toHaveBeenCalledWith(fileBytes, {
        password: "master password",
        keyFile: keyFileBytes,
      });
    });

    it("names the key file when it can't be read, e.g. because it moved", async () => {
      const repository = fakeRepository();
      const fileStorage = fakeFileStorage({
        readFile: vi.fn((path: string) =>
          path.endsWith(".keyx")
            ? Promise.reject(new Error("os error 2"))
            : Promise.resolve(new ArrayBuffer(4)),
        ),
      });
      const service = new VaultAccessService(repository, fakeDialog(), fileStorage);

      await expect(
        service.openVaultAtPath("C:/vaults/mine.kdbx", "master password", "C:/keys/mine.keyx"),
      ).rejects.toThrow("Couldn't read the key file at C:/keys/mine.keyx. Choose it again.");
      expect(repository.openVault).not.toHaveBeenCalled();
    });
  });

  describe("pickKeyFile", () => {
    it("prompts the key file dialog", async () => {
      const dialog = fakeDialog({ pickKeyFile: vi.fn().mockResolvedValue("C:/keys/mine.keyx") });
      const service = new VaultAccessService(fakeRepository(), dialog, fakeFileStorage());

      expect(await service.pickKeyFile()).toBe("C:/keys/mine.keyx");
    });
  });

  describe("closeVault", () => {
    it("drops the open vault, so nothing can be saved or re-keyed until it's reopened", async () => {
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(Vault.create("My Vault")),
      });
      const fileStorage = fakeFileStorage();
      const service = await serviceWithOpenVault(repository, fileStorage);

      service.closeVault();

      await expect(
        service.saveVault(Vault.create("My Vault"), "C:/vaults/mine.kdbx"),
      ).rejects.toThrow("No vault is open");
      await expect(
        service.changeMasterPassword(Vault.create("My Vault"), "C:/vaults/mine.kdbx", "a", "b"),
      ).rejects.toThrow("No vault is open");
      expect(repository.saveVault).not.toHaveBeenCalled();
      expect(fileStorage.writeFile).not.toHaveBeenCalled();
    });

    it("lets a vault be opened again afterwards", async () => {
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(Vault.create("My Vault")),
      });
      const fileStorage = fakeFileStorage();
      const service = await serviceWithOpenVault(repository, fileStorage);

      service.closeVault();
      await service.openVaultAtPath("C:/vaults/mine.kdbx", "master password");
      await service.saveVault(Vault.create("My Vault"), "C:/vaults/mine.kdbx");

      expect(fileStorage.writeFile).toHaveBeenCalled();
    });
  });

  describe("getFileInfo", () => {
    it("reports the file's size and last-modified time", async () => {
      const repository = fakeRepository();
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({
        size: vi.fn().mockResolvedValue(49152),
        lastModified: vi.fn().mockResolvedValue(1_700_000_000_000),
      });
      const service = new VaultAccessService(repository, dialog, fileStorage);

      const result = await service.getFileInfo("C:/vaults/mine.kdbx");

      expect(fileStorage.size).toHaveBeenCalledWith("C:/vaults/mine.kdbx");
      expect(fileStorage.lastModified).toHaveBeenCalledWith("C:/vaults/mine.kdbx");
      expect(result).toEqual({ sizeBytes: 49152, lastModifiedMs: 1_700_000_000_000 });
    });
  });

  describe("saveVault", () => {
    it("serializes the vault through the repository and writes it to the given path", async () => {
      const vault = Vault.create("My Vault");
      const fileBytes = new ArrayBuffer(4);
      const repository = fakeRepository({ saveVault: vi.fn().mockResolvedValue(fileBytes) });
      const fileStorage = fakeFileStorage();
      const service = await serviceWithOpenVault(repository, fileStorage);

      await service.saveVault(vault, "C:/vaults/mine.kdbx");

      expect(repository.saveVault).toHaveBeenCalledWith(vault);
      expect(fileStorage.writeFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx", fileBytes);
    });

    it("propagates errors from the repository", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockRejectedValue(new Error("Save failed")),
      });
      const fileStorage = fakeFileStorage();
      const service = await serviceWithOpenVault(repository, fileStorage);

      await expect(service.saveVault(vault, "C:/vaults/mine.kdbx")).rejects.toThrow("Save failed");
      expect(fileStorage.writeFile).not.toHaveBeenCalled();
    });

    it("leaves the existing backups alone when serializing fails", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(vault),
        saveVault: vi.fn().mockRejectedValue(new Error("Save failed")),
      });
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        exists: vi.fn().mockResolvedValue(true),
      });
      const service = await serviceWithOpenVault(repository, fileStorage);

      await expect(service.saveVault(vault, "C:/vaults/mine.kdbx")).rejects.toThrow("Save failed");

      expect(fileStorage.copyFile).not.toHaveBeenCalled();
    });

    it("throws a conflict error instead of overwriting when the file changed on disk since it was opened", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(vault),
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        exists: vi.fn().mockResolvedValue(true),
        lastModified: vi.fn().mockResolvedValueOnce(1000).mockResolvedValueOnce(2000),
      });
      const service = new VaultAccessService(repository, dialog, fileStorage);
      await service.openVaultAtPath("C:/vaults/mine.kdbx", "master password");

      await expect(service.saveVault(vault, "C:/vaults/mine.kdbx")).rejects.toBeInstanceOf(
        VaultSaveConflictError,
      );
      expect(repository.saveVault).not.toHaveBeenCalled();
      expect(fileStorage.writeFile).not.toHaveBeenCalled();
      expect(fileStorage.copyFile).not.toHaveBeenCalled();
    });

    it("does not conflict when the on-disk file is unchanged since it was opened", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(vault),
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        exists: vi.fn().mockResolvedValue(true),
        lastModified: vi.fn().mockResolvedValue(1000),
      });
      const service = new VaultAccessService(repository, dialog, fileStorage);
      await service.openVaultAtPath("C:/vaults/mine.kdbx", "master password");

      await service.saveVault(vault, "C:/vaults/mine.kdbx");

      expect(repository.saveVault).toHaveBeenCalledWith(vault);
      expect(fileStorage.writeFile).toHaveBeenCalledWith(
        "C:/vaults/mine.kdbx",
        expect.any(ArrayBuffer),
      );
    });

    it("bypasses the conflict check when forced", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(vault),
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        exists: vi.fn().mockResolvedValue(true),
        lastModified: vi.fn().mockResolvedValueOnce(1000).mockResolvedValueOnce(2000),
      });
      const service = new VaultAccessService(repository, dialog, fileStorage);
      await service.openVaultAtPath("C:/vaults/mine.kdbx", "master password");

      await service.saveVault(vault, "C:/vaults/mine.kdbx", { force: true });

      expect(repository.saveVault).toHaveBeenCalledWith(vault);
      expect(fileStorage.writeFile).toHaveBeenCalled();
    });

    it("does not check for a conflict when saving a path that was never opened/saved here", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const fileStorage = fakeFileStorage({
        exists: vi.fn().mockResolvedValue(true),
        // Would look like a conflict if this path had ever been read here.
        lastModified: vi.fn().mockResolvedValueOnce(1000).mockResolvedValue(2000),
      });
      // The session came from a different file, so "mine.kdbx" is one this
      // service has no recorded mtime for and has nothing to conflict with.
      const service = await serviceWithOpenVault(repository, fileStorage, "C:/vaults/other.kdbx");

      await service.saveVault(vault, "C:/vaults/mine.kdbx");

      expect(repository.saveVault).toHaveBeenCalledWith(vault);
      expect(fileStorage.writeFile).toHaveBeenCalled();
    });

    it("rotates up to 3 rolling backups when the file already exists", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const fileStorage = fakeFileStorage({
        exists: vi
          .fn()
          .mockImplementation((path: string) => Promise.resolve(!path.endsWith(".bak3"))),
      });
      const service = await serviceWithOpenVault(repository, fileStorage);

      await service.saveVault(vault, "C:/vaults/mine.kdbx");

      expect(fileStorage.copyFile).toHaveBeenCalledWith(
        "C:/vaults/mine.kdbx.bak2",
        "C:/vaults/mine.kdbx.bak3",
      );
      expect(fileStorage.copyFile).toHaveBeenCalledWith(
        "C:/vaults/mine.kdbx.bak1",
        "C:/vaults/mine.kdbx.bak2",
      );
      expect(fileStorage.copyFile).toHaveBeenCalledWith(
        "C:/vaults/mine.kdbx",
        "C:/vaults/mine.kdbx.bak1",
      );
      const order = vi.mocked(fileStorage.copyFile).mock.invocationCallOrder;
      expect(order[0]).toBeLessThan(order[1]);
      expect(order[1]).toBeLessThan(order[2]);
    });

    it("skips shifting older backups that don't exist yet, still backing up the current file", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const fileStorage = fakeFileStorage({
        exists: vi
          .fn()
          .mockImplementation((path: string) => Promise.resolve(!path.includes(".bak"))),
      });
      const service = await serviceWithOpenVault(repository, fileStorage);

      await service.saveVault(vault, "C:/vaults/mine.kdbx");

      expect(fileStorage.copyFile).toHaveBeenCalledTimes(1);
      expect(fileStorage.copyFile).toHaveBeenCalledWith(
        "C:/vaults/mine.kdbx",
        "C:/vaults/mine.kdbx.bak1",
      );
    });

    it("asks for filesystem access to the backup paths before touching them", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const fileStorage = fakeFileStorage({ exists: vi.fn().mockResolvedValue(true) });
      const service = await serviceWithOpenVault(repository, fileStorage);

      await service.saveVault(vault, "C:/vaults/mine.kdbx", { force: true });

      expect(fileStorage.grantAccess).toHaveBeenCalledWith("C:/vaults/mine.kdbx", ".bak1");
      expect(fileStorage.grantAccess).toHaveBeenCalledWith("C:/vaults/mine.kdbx", ".bak2");
      expect(fileStorage.grantAccess).toHaveBeenCalledWith("C:/vaults/mine.kdbx", ".bak3");
      const granted = vi.mocked(fileStorage.grantAccess).mock.invocationCallOrder;
      const copied = vi.mocked(fileStorage.copyFile).mock.invocationCallOrder;
      expect(Math.max(...granted)).toBeLessThan(Math.min(...copied));
    });

    it("does not rotate backups when the file does not already exist", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const fileStorage = fakeFileStorage({ exists: vi.fn().mockResolvedValue(false) });
      const service = await serviceWithOpenVault(repository, fileStorage);

      await service.saveVault(vault, "C:/vaults/mine.kdbx");

      expect(fileStorage.copyFile).not.toHaveBeenCalled();
      expect(fileStorage.grantAccess).not.toHaveBeenCalled();
    });
  });

  describe("changeMasterPassword", () => {
    it("re-keys the vault through the repository, then saves it", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        changeMasterPassword: vi.fn().mockResolvedValue(undefined),
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const fileStorage = fakeFileStorage();
      const service = await serviceWithOpenVault(repository, fileStorage);

      await service.changeMasterPassword(vault, "C:/vaults/mine.kdbx", "old pw", "new pw");

      expect(repository.changeMasterPassword).toHaveBeenCalledWith("old pw", "new pw");
      expect(repository.saveVault).toHaveBeenCalledWith(vault);
      expect(fileStorage.writeFile).toHaveBeenCalledWith(
        "C:/vaults/mine.kdbx",
        expect.any(ArrayBuffer),
      );
    });

    it("propagates errors from the repository without saving", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        changeMasterPassword: vi
          .fn()
          .mockRejectedValue(new Error("Current password is incorrect.")),
        saveVault: vi.fn(),
      });
      const fileStorage = fakeFileStorage();
      const service = await serviceWithOpenVault(repository, fileStorage);

      await expect(
        service.changeMasterPassword(vault, "C:/vaults/mine.kdbx", "wrong", "new pw"),
      ).rejects.toThrow("Current password is incorrect.");
      expect(repository.saveVault).not.toHaveBeenCalled();
      expect(fileStorage.writeFile).not.toHaveBeenCalled();
    });

    it("refuses to re-key when no vault is open", async () => {
      const service = new VaultAccessService(fakeRepository(), fakeDialog(), fakeFileStorage());

      await expect(
        service.changeMasterPassword(Vault.create("Unopened"), "C:/vaults/mine.kdbx", "a", "b"),
      ).rejects.toThrow("No vault is open");
    });

    it("refuses to re-key at all when the file changed on disk", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(vault),
        changeMasterPassword: vi.fn().mockResolvedValue(undefined),
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        exists: vi.fn().mockResolvedValue(true),
        lastModified: vi.fn().mockResolvedValueOnce(1000).mockResolvedValueOnce(2000),
      });
      const service = new VaultAccessService(repository, dialog, fileStorage);
      await service.openVaultAtPath("C:/vaults/mine.kdbx", "master password");

      await expect(
        service.changeMasterPassword(vault, "C:/vaults/mine.kdbx", "old pw", "new pw"),
      ).rejects.toBeInstanceOf(VaultSaveConflictError);
      // The re-key mutates the open document's credentials. Doing it before
      // discovering the conflict would leave the app holding a password the
      // file on disk was never written with.
      expect(repository.changeMasterPassword).not.toHaveBeenCalled();
      expect(fileStorage.writeFile).not.toHaveBeenCalled();
    });

    it("re-encrypts every existing backup with the new password after saving the vault", async () => {
      const vault = Vault.create("My Vault");
      const backupBytes = new ArrayBuffer(8);
      const rekeyedBytes = new ArrayBuffer(16);
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        rekeyFile: vi.fn().mockResolvedValue(rekeyedBytes),
      });
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(backupBytes),
        exists: vi
          .fn()
          .mockImplementation((path: string) => Promise.resolve(!path.endsWith(".bak3"))),
      });
      const service = await serviceWithOpenVault(repository, fileStorage);

      const result = await service.changeMasterPassword(
        vault,
        "C:/vaults/mine.kdbx",
        "old pw",
        "new pw",
      );

      expect(repository.rekeyFile).toHaveBeenCalledTimes(2);
      expect(repository.rekeyFile).toHaveBeenCalledWith(
        backupBytes,
        { password: "old pw" },
        "new pw",
      );
      expect(fileStorage.writeFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx.bak1", rekeyedBytes);
      expect(fileStorage.writeFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx.bak2", rekeyedBytes);
      expect(fileStorage.writeFile).not.toHaveBeenCalledWith(
        "C:/vaults/mine.kdbx.bak3",
        expect.anything(),
      );
      // The vault itself is written first: a backup failing must not stop the
      // password change from reaching disk.
      const writes = vi.mocked(fileStorage.writeFile).mock.calls.map(([path]) => path);
      expect(writes[0]).toBe("C:/vaults/mine.kdbx");
      expect(result).toEqual({ removedBackups: [], unprotectedBackups: [] });
    });

    it("re-keys the backups with the key file the vault was unlocked with", async () => {
      const keyFileBytes = new ArrayBuffer(32);
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(Vault.create("My Vault")),
      });
      const fileStorage = fakeFileStorage({
        readFile: vi.fn((path: string) =>
          Promise.resolve(path.endsWith(".keyx") ? keyFileBytes : new ArrayBuffer(4)),
        ),
        exists: vi.fn().mockResolvedValue(true),
      });
      const service = new VaultAccessService(repository, fakeDialog(), fileStorage);
      await service.openVaultAtPath("C:/vaults/mine.kdbx", "old pw", "C:/keys/mine.keyx");

      await service.changeMasterPassword(
        Vault.create("My Vault"),
        "C:/vaults/mine.kdbx",
        "old pw",
        "new pw",
      );

      expect(repository.rekeyFile).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        { password: "old pw", keyFile: keyFileBytes },
        "new pw",
      );
    });

    it("doesn't carry a previous vault's key file over to a newly created one", async () => {
      const repository = fakeRepository({
        openVault: vi.fn().mockResolvedValue(Vault.create("My Vault")),
        createVault: vi.fn().mockResolvedValue(Vault.create("Fresh")),
      });
      const dialog = fakeDialog({
        pickPathForNewVault: vi.fn().mockResolvedValue("C:/vaults/mine.kdbx"),
      });
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        exists: vi.fn().mockResolvedValue(true),
      });
      const service = new VaultAccessService(repository, dialog, fileStorage);
      await service.openVaultAtPath("C:/vaults/mine.kdbx", "old pw", "C:/keys/mine.keyx");

      await service.createNewVault("Fresh", "old pw");
      await service.changeMasterPassword(
        Vault.create("Fresh"),
        "C:/vaults/mine.kdbx",
        "old pw",
        "new pw",
      );

      expect(repository.rekeyFile).toHaveBeenLastCalledWith(
        expect.any(ArrayBuffer),
        { password: "old pw", keyFile: undefined },
        "new pw",
      );
    });

    it("deletes a backup the old password doesn't open instead of leaving it behind", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        rekeyFile: vi
          .fn()
          .mockResolvedValueOnce(new ArrayBuffer(4))
          .mockRejectedValueOnce(new Error("Incorrect password"))
          .mockResolvedValueOnce(new ArrayBuffer(4)),
      });
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        exists: vi.fn().mockResolvedValue(true),
      });
      const service = await serviceWithOpenVault(repository, fileStorage);

      const result = await service.changeMasterPassword(
        vault,
        "C:/vaults/mine.kdbx",
        "old pw",
        "new pw",
      );

      expect(fileStorage.removeFile).toHaveBeenCalledTimes(1);
      expect(fileStorage.removeFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx.bak2");
      expect(result).toEqual({
        removedBackups: ["C:/vaults/mine.kdbx.bak2"],
        unprotectedBackups: [],
      });
    });

    it("reports a backup it couldn't get filesystem access to, without failing the change", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const fileStorage = fakeFileStorage({
        // Nothing on disk yet, so the save doesn't rotate: the only grants
        // are the re-key pass's own.
        grantAccess: vi
          .fn()
          .mockImplementation((_basePath: string, suffix: string) =>
            suffix === ".bak3" ? Promise.reject(new Error("out of scope")) : Promise.resolve(),
          ),
      });
      const service = await serviceWithOpenVault(repository, fileStorage);

      const result = await service.changeMasterPassword(
        vault,
        "C:/vaults/mine.kdbx",
        "old pw",
        "new pw",
      );

      expect(result).toEqual({
        removedBackups: [],
        unprotectedBackups: ["C:/vaults/mine.kdbx.bak3"],
      });
    });

    it("reports a backup it can neither re-key nor delete, without failing the change", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        rekeyFile: vi.fn().mockRejectedValue(new Error("Incorrect password")),
      });
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        exists: vi
          .fn()
          .mockImplementation((path: string) =>
            Promise.resolve(!path.endsWith(".bak2") && !path.endsWith(".bak3")),
          ),
        removeFile: vi.fn().mockRejectedValue(new Error("Access denied")),
      });
      const service = await serviceWithOpenVault(repository, fileStorage);

      const result = await service.changeMasterPassword(
        vault,
        "C:/vaults/mine.kdbx",
        "old pw",
        "new pw",
      );

      expect(result).toEqual({
        removedBackups: [],
        unprotectedBackups: ["C:/vaults/mine.kdbx.bak1"],
      });
    });
  });
});
