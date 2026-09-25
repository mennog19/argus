import { describe, expect, it, vi } from "vitest";
import { Vault } from "../domain";
import { FileStorage } from "./file-storage";
import { VaultFileDialog } from "./vault-file-dialog";
import { VaultAccessService, VaultSaveConflictError } from "./vault-access-service";
import { VaultRepository } from "./vault-repository";

function fakeRepository(overrides: Partial<VaultRepository> = {}): VaultRepository {
  return {
    openVault: vi.fn(),
    createVault: vi.fn(),
    saveVault: vi.fn(),
    changeMasterPassword: vi.fn(),
    ...overrides,
  };
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
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage();
      const service = new VaultAccessService(repository, dialog, fileStorage);

      await service.saveVault(vault, "C:/vaults/mine.kdbx");

      expect(repository.saveVault).toHaveBeenCalledWith(vault);
      expect(fileStorage.writeFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx", fileBytes);
    });

    it("propagates errors from the repository", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockRejectedValue(new Error("Save failed")),
      });
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage();
      const service = new VaultAccessService(repository, dialog, fileStorage);

      await expect(service.saveVault(vault, "C:/vaults/mine.kdbx")).rejects.toThrow("Save failed");
      expect(fileStorage.writeFile).not.toHaveBeenCalled();
    });

    it("leaves the existing backups alone when serializing fails", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockRejectedValue(new Error("Save failed")),
      });
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({ exists: vi.fn().mockResolvedValue(true) });
      const service = new VaultAccessService(repository, dialog, fileStorage);

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
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({ exists: vi.fn().mockResolvedValue(true) });
      const service = new VaultAccessService(repository, dialog, fileStorage);

      await service.saveVault(vault, "C:/vaults/mine.kdbx");

      expect(repository.saveVault).toHaveBeenCalledWith(vault);
      expect(fileStorage.writeFile).toHaveBeenCalled();
    });

    it("rotates up to 3 rolling backups when the file already exists", async () => {
      const vault = Vault.create("My Vault");
      const repository = fakeRepository({
        saveVault: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({
        exists: vi
          .fn()
          .mockImplementation((path: string) => Promise.resolve(!path.endsWith(".bak3"))),
      });
      const service = new VaultAccessService(repository, dialog, fileStorage);

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
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({
        exists: vi
          .fn()
          .mockImplementation((path: string) => Promise.resolve(!path.includes(".bak"))),
      });
      const service = new VaultAccessService(repository, dialog, fileStorage);

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
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({ exists: vi.fn().mockResolvedValue(true) });
      const service = new VaultAccessService(repository, dialog, fileStorage);

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
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage({ exists: vi.fn().mockResolvedValue(false) });
      const service = new VaultAccessService(repository, dialog, fileStorage);

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
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage();
      const service = new VaultAccessService(repository, dialog, fileStorage);

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
      const dialog = fakeDialog();
      const fileStorage = fakeFileStorage();
      const service = new VaultAccessService(repository, dialog, fileStorage);

      await expect(
        service.changeMasterPassword(vault, "C:/vaults/mine.kdbx", "wrong", "new pw"),
      ).rejects.toThrow("Current password is incorrect.");
      expect(repository.saveVault).not.toHaveBeenCalled();
      expect(fileStorage.writeFile).not.toHaveBeenCalled();
    });

    it("surfaces a save conflict raised while persisting the re-keyed vault", async () => {
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
      expect(repository.changeMasterPassword).toHaveBeenCalledWith("old pw", "new pw");
    });
  });
});
