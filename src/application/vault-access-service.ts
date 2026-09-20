import { Vault } from "../domain";
import { FileStorage } from "./file-storage";
import { VaultFileDialog } from "./vault-file-dialog";
import { VaultRepository } from "./vault-repository";

export interface OpenedVault {
  vault: Vault;
  filePath: string;
}

export interface SaveVaultOptions {
  /** Bypasses the on-disk modification check, overwriting unconditionally. */
  force?: boolean;
}

/**
 * Thrown by `saveVault` when the file at `filePath` was modified on disk
 * since it was last opened/saved through this service, so the caller can
 * warn the user instead of silently discarding the external change.
 */
export class VaultSaveConflictError extends Error {
  constructor(filePath: string) {
    super(`Vault file changed on disk since it was last opened or saved: ${filePath}`);
    this.name = "VaultSaveConflictError";
  }
}

const BACKUP_SUFFIXES = [".bak1", ".bak2", ".bak3"];

/**
 * Orchestrates the open-existing / create-new vault flows: prompt for a
 * file path via the native dialog, then read/write bytes through
 * `FileStorage` and parse/build them through `VaultRepository`. Returns
 * `undefined` when the user cancels the file dialog instead of throwing, so
 * callers can distinguish "cancelled" from "failed".
 */
export class VaultAccessService {
  private readonly lastKnownMtime = new Map<string, number>();

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
    await this.rememberMtime(filePath);
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
    await this.rememberMtime(filePath);
    return { vault, filePath };
  }

  /**
   * Re-opens a previously-opened vault at a known path without prompting the
   * file dialog again, for unlocking a remembered/recent vault.
   */
  async openVaultAtPath(filePath: string, masterPassword: string): Promise<Vault> {
    const fileBytes = await this.fileStorage.readFile(filePath);
    const vault = await this.repository.openVault(fileBytes, masterPassword);
    await this.rememberMtime(filePath);
    return vault;
  }

  /**
   * Persists an already-open vault back to its file, for use after local
   * edits (entry/group create/edit/delete). Throws on failure without
   * writing, so callers can keep their in-memory edit and show an error
   * instead of silently losing it.
   *
   * Unless `options.force` is set, first checks whether the file changed on
   * disk since it was last opened/saved here, throwing
   * `VaultSaveConflictError` instead of overwriting that external change.
   * On a successful write, rotates up to 3 rolling backups of the previous
   * contents (`<path>.bak1` most recent, `.bak3` oldest).
   */
  async saveVault(vault: Vault, filePath: string, options: SaveVaultOptions = {}): Promise<void> {
    const fileExists = await this.fileStorage.exists(filePath);
    const knownMtime = this.lastKnownMtime.get(filePath);

    if (fileExists && !options.force && knownMtime !== undefined) {
      const onDiskMtime = await this.fileStorage.lastModified(filePath);
      if (onDiskMtime !== knownMtime) {
        throw new VaultSaveConflictError(filePath);
      }
    }

    if (fileExists) {
      await this.rotateBackups(filePath);
    }

    const fileBytes = await this.repository.saveVault(vault);
    await this.fileStorage.writeFile(filePath, fileBytes);
    await this.rememberMtime(filePath);
  }

  private async rotateBackups(filePath: string): Promise<void> {
    for (let i = BACKUP_SUFFIXES.length - 1; i > 0; i--) {
      const source = filePath + BACKUP_SUFFIXES[i - 1];
      if (await this.fileStorage.exists(source)) {
        await this.fileStorage.copyFile(source, filePath + BACKUP_SUFFIXES[i]);
      }
    }
    await this.fileStorage.copyFile(filePath, filePath + BACKUP_SUFFIXES[0]);
  }

  private async rememberMtime(filePath: string): Promise<void> {
    const mtime = await this.fileStorage.lastModified(filePath);
    this.lastKnownMtime.set(filePath, mtime);
  }
}
