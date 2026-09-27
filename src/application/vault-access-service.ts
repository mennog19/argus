import { Vault } from "../domain";
import { FileStorage } from "./file-storage";
import { VaultFileDialog } from "./vault-file-dialog";
import { VaultRepository, VaultSession } from "./vault-repository";

export interface OpenedVault {
  vault: Vault;
  filePath: string;
}

export interface VaultFileInfo {
  sizeBytes: number;
  lastModifiedMs: number;
}

export interface SaveVaultOptions {
  /** Bypasses the on-disk modification check, overwriting unconditionally. */
  force?: boolean;
}

/**
 * Thrown by `saveVault` when the file at `filePath` was modified on disk
 * since it was last opened/saved through this service, so the caller can
 * warn the user instead of silently discarding the external change.
 *
 * The message is written for the user: this reaches the screen that asked
 * for the save, alongside the modal offering to overwrite or discard.
 */
export class VaultSaveConflictError extends Error {
  constructor(readonly filePath: string) {
    super("This vault changed on disk, so nothing was saved. Choose how to resolve that first.");
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
  /** The vault currently open, if any. Argus shows one vault at a time. */
  private session: VaultSession | undefined;

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
    this.session = await this.repository.openVault(fileBytes, masterPassword);
    await this.rememberMtime(filePath);
    return { vault: this.session.vault, filePath };
  }

  async createNewVault(name: string, masterPassword: string): Promise<OpenedVault | undefined> {
    const filePath = await this.dialog.pickPathForNewVault();
    if (!filePath) {
      return undefined;
    }

    const session = await this.repository.createVault(name, masterPassword);
    const fileBytes = await session.save(session.vault);
    await this.fileStorage.writeFile(filePath, fileBytes);
    this.session = session;
    await this.rememberMtime(filePath);
    return { vault: session.vault, filePath };
  }

  /**
   * Re-opens a previously-opened vault at a known path without prompting the
   * file dialog again, for unlocking a remembered/recent vault.
   */
  async openVaultAtPath(filePath: string, masterPassword: string): Promise<Vault> {
    const fileBytes = await this.fileStorage.readFile(filePath);
    this.session = await this.repository.openVault(fileBytes, masterPassword);
    await this.rememberMtime(filePath);
    return this.session.vault;
  }

  /**
   * The open vault's document. The lifecycle lives here rather than in the
   * repository, so this is the one place that has to state the invariant —
   * the repository itself is stateless and can't be called out of order.
   */
  private openSession(): VaultSession {
    if (!this.session) {
      throw new Error("No vault is open; open or create one before saving");
    }
    return this.session;
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
   * Once the vault has serialized, rotates up to 3 rolling backups of the
   * previous contents (`<path>.bak1` most recent, `.bak3` oldest) and then
   * writes. `FileStorage.writeFile` is expected to be atomic, so the file is
   * never left half-written.
   */
  async saveVault(vault: Vault, filePath: string, options: SaveVaultOptions = {}): Promise<void> {
    const fileExists = await this.fileStorage.exists(filePath);

    if (!options.force) {
      await this.assertNoConflict(filePath, fileExists);
    }

    // Serialize before touching any backup: a failure here must not have already
    // rotated the older backups out in favour of copies of the current file.
    const fileBytes = await this.openSession().save(vault);

    if (fileExists) {
      await this.rotateBackups(filePath);
    }

    await this.fileStorage.writeFile(filePath, fileBytes);
    await this.rememberMtime(filePath);
  }

  /**
   * Re-keys the open vault with a new master password and immediately
   * persists it via `saveVault` (including its backup rotation), so a re-key
   * never leaves the file re-encrypted in memory without a matching save on
   * disk.
   *
   * The conflict check runs *before* the re-key, not just inside `saveVault`:
   * re-keying mutates the open document's credentials, so a conflict
   * discovered afterwards would leave the app holding a password the file on
   * disk has never been written with.
   */
  async changeMasterPassword(
    vault: Vault,
    filePath: string,
    currentMasterPassword: string,
    newMasterPassword: string,
  ): Promise<void> {
    await this.assertNoConflict(filePath, await this.fileStorage.exists(filePath));
    await this.openSession().changeMasterPassword(currentMasterPassword, newMasterPassword);
    await this.saveVault(vault, filePath);
  }

  /**
   * Throws `VaultSaveConflictError` when the file changed on disk since it
   * was last opened or saved through this service. A file this service has
   * never seen, or one that doesn't exist yet, has nothing to conflict with.
   */
  private async assertNoConflict(filePath: string, fileExists: boolean): Promise<void> {
    const knownMtime = this.lastKnownMtime.get(filePath);
    if (!fileExists || knownMtime === undefined) {
      return;
    }
    if ((await this.fileStorage.lastModified(filePath)) !== knownMtime) {
      throw new VaultSaveConflictError(filePath);
    }
  }

  /** Current on-disk size and last-modified time of the vault at `filePath`. */
  async getFileInfo(filePath: string): Promise<VaultFileInfo> {
    const [sizeBytes, lastModifiedMs] = await Promise.all([
      this.fileStorage.size(filePath),
      this.fileStorage.lastModified(filePath),
    ]);
    return { sizeBytes, lastModifiedMs };
  }

  private async rotateBackups(filePath: string): Promise<void> {
    // Backup paths are derived here rather than picked by the user, so the OS
    // layer has to be told about them before they can be read or written.
    for (const suffix of BACKUP_SUFFIXES) {
      await this.fileStorage.grantAccess(filePath + suffix);
    }

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
