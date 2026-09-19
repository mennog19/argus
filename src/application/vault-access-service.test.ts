import { describe, expect, it, vi } from "vitest";
import { Vault } from "../domain";
import { FileStorage } from "./file-storage";
import { VaultFileDialog } from "./vault-file-dialog";
import { VaultAccessService } from "./vault-access-service";
import { VaultRepository } from "./vault-repository";

function fakeRepository(overrides: Partial<VaultRepository> = {}): VaultRepository {
  return {
    openVault: vi.fn(),
    createVault: vi.fn(),
    saveVault: vi.fn(),
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
      const dialog = fakeDialog({ pickVaultToOpen: vi.fn().mockResolvedValue("C:/vaults/mine.kdbx") });
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
      const dialog = fakeDialog({ pickPathForNewVault: vi.fn().mockResolvedValue("C:/vaults/new.kdbx") });
      const fileStorage = fakeFileStorage();
      const service = new VaultAccessService(repository, dialog, fileStorage);

      const result = await service.createNewVault("New Vault", "master password");

      expect(repository.createVault).toHaveBeenCalledWith("New Vault", "master password");
      expect(repository.saveVault).toHaveBeenCalledWith(vault);
      expect(fileStorage.writeFile).toHaveBeenCalledWith("C:/vaults/new.kdbx", fileBytes);
      expect(result).toEqual({ vault, filePath: "C:/vaults/new.kdbx" });
    });
  });
});
