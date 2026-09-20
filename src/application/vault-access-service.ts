import { Vault } from "../domain";
import { FileStorage } from "./file-storage";
import { VaultFileDialog } from "./vault-file-dialog";
import { VaultRepository } from "./vault-repository";

export interface OpenedVault {
  vault: Vault;
  filePath: string;
}

/**
 * Orchestrates the open-existing / create-new vault flows: prompt for a
 * file path via the native dialog, then read/write bytes through
 * `FileStorage` and parse/build them through `VaultRepository`. Returns
 * `undefined` when the user cancels the file dialog instead of throwing, so
 * callers can distinguish "cancelled" from "failed".
 */
export class VaultAccessService {
  constructor(
    private readonly repository: VaultRepository,
    private readonly dialog: VaultFileDialog,
    private readonly fileStorage: FileStorage,
  ) {}

  async openExistingVault(masterPassword: string): Promise<OpenedVault | undefined> {
    const filePath = await this.dialog.pickVaultToOpen();
    if (!filePath) {
      return undefined;
    }

    const fileBytes = await this.fileStorage.readFile(filePath);
    const vault = await this.repository.openVault(fileBytes, masterPassword);
    return { vault, filePath };
  }

  async createNewVault(name: string, masterPassword: string): Promise<OpenedVault | undefined> {
    const filePath = await this.dialog.pickPathForNewVault();
    if (!filePath) {
      return undefined;
    }

    const vault = await this.repository.createVault(name, masterPassword);
    const fileBytes = await this.repository.saveVault(vault);
    await this.fileStorage.writeFile(filePath, fileBytes);
    return { vault, filePath };
  }

  /**
   * Re-opens a previously-opened vault at a known path without prompting the
   * file dialog again, for unlocking a remembered/recent vault.
   */
  async openVaultAtPath(filePath: string, masterPassword: string): Promise<Vault> {
    const fileBytes = await this.fileStorage.readFile(filePath);
    return this.repository.openVault(fileBytes, masterPassword);
  }

  /**
   * Persists an already-open vault back to its file, for use after local
   * edits (entry/group create/edit/delete). Throws on failure without
   * writing, so callers can keep their in-memory edit and show an error
   * instead of silently losing it.
   */
  async saveVault(vault: Vault, filePath: string): Promise<void> {
    const fileBytes = await this.repository.saveVault(vault);
    await this.fileStorage.writeFile(filePath, fileBytes);
  }
}
