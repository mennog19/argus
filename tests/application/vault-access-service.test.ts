import { describe, expect, it, vi } from "vitest";
import { Vault } from "../../src/domain";
import { FileStorage } from "../../src/application/file-storage";
import { VaultFileDialog } from "../../src/application/vault-file-dialog";
import {
  VaultAccessService,
  VaultSaveConflictError,
} from "../../src/application/vault-access-service";
import { VaultRepository, VaultSession } from "../../src/application/vault-repository";

/**
 * A repository whose sessions delegate to one shared pair of mocks, so tests
 * can go on asserting "the repository saved" without assembling a session for
 * every case. `openVault`/`createVault` overrides still resolve to a `Vault`;
 * the wrapper puts it in a session.
 */
type OpenFake = (fileBytes: ArrayBuffer, masterPassword: string) => Promise<Vault>;
type CreateFake = (name: string, masterPassword: string) => Promise<Vault>;
type SaveFake = (vault: Vault) => Promise<ArrayBuffer>;
type RekeyFake = (currentMasterPassword: string, newMasterPassword: string) => Promise<void>;

function fakeRepository(
  overrides: {
    openVault?: OpenFake;
    createVault?: CreateFake;
    saveVault?: SaveFake;
    changeMasterPassword?: RekeyFake;
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
    openVault: vi.fn(async (fileBytes: ArrayBuffer, masterPassword: string) =>
      sessionFor(await openVault(fileBytes, masterPassword)),
    ),
    createVault: vi.fn(async (name: string, masterPassword: string) =>
      sessionFor(await createVault(name, masterPassword)),
    ),
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
      expect(repository.openVault).toHaveBeenCalledWith(fileBytes, "master password");
      expect(result).toEqual({ vault, filePath: "C:/vaults/mine.kdbx" });
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
      expect(repository.openVault).toHaveBeenCalledWith(fileBytes, "master password");
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

      expect(fileStorage.grantAccess).toHaveBeenCalledWith("C:/vaults/mine.kdbx.bak1");
      expect(fileStorage.grantAccess).toHaveBeenCalledWith("C:/vaults/mine.kdbx.bak2");
      expect(fileStorage.grantAccess).toHaveBeenCalledWith("C:/vaults/mine.kdbx.bak3");
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
  });
});
