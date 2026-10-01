import { Vault } from "../domain";
import { FileStorage } from "./file-storage";
import { VaultFileDialog } from "./vault-file-dialog";
import { VaultFormat, VaultKey, VaultRepository, VaultSession } from "./vault-repository";
import { VaultSettings } from "./vault-settings";

export interface OpenedVault {
  vault: Vault;
  filePath: string;
  /** The key file it was unlocked with, if any. */
  keyFilePath?: string;
}

/**
 * The key file a new vault is created with: one generated fresh and saved to
 * `path`, or an existing file at `path` whose bytes become the key as-is.
 */
export type NewVaultKeyFile =
  | { readonly kind: "generate"; readonly path: string }
  | { readonly kind: "existing"; readonly path: string };

/**
 * What to do with an open vault's key file: lock it with a newly generated
 * one saved to `path`, with the existing file at `path`, or with none.
 */
export type KeyFileChange = NewVaultKeyFile | { readonly kind: "remove" };

export interface VaultFileInfo {
  sizeBytes: number;
  lastModifiedMs: number;
  /** The open vault's format, which is what its last open or save left on disk. */
  format: VaultFormat;
  /** Whether the open vault's key includes a key file. */
  hasKeyFile: boolean;
  /** The open vault's own settings, as its last open or save left them on disk. */
  settings: VaultSettings;
}

export interface SaveVaultOptions {
  /** Bypasses the on-disk modification check, overwriting unconditionally. */
  force?: boolean;
}

/** What happened to a vault's rolling backups when its master password or key file changed. */
export interface MasterPasswordChangeResult {
  /** Backups that couldn't be re-keyed (e.g. the old password didn't open them), deleted instead. */
  removedBackups: string[];
  /** Backups that could be neither re-keyed nor deleted: may still open with the old password. */
  unprotectedBackups: string[];
}

export interface KeyFileChangeResult extends MasterPasswordChangeResult {
  /** The key file the vault now needs, to remember for unlocking it; none once removed. */
  keyFilePath: string | undefined;
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
 * Suffix of the copy `upgradeVaultFormat` keeps of a vault's KDBX 3 file.
 * Outside the rolling backups, so later saves never rotate it away, and ending
 * in `.kdbx` so KeePass opens it as is.
 */
const KDBX3_COPY_SUFFIX = ".kdbx3-backup.kdbx";

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
  /**
   * The key file the open vault was unlocked with, if it has one. Kept for
   * re-keying its backups, which need the same key file to open.
   */
  private keyFile: ArrayBuffer | undefined;

  constructor(
    private readonly repository: VaultRepository,
    private readonly dialog: VaultFileDialog,
    private readonly fileStorage: FileStorage,
  ) {}

  /** Prompts for a key file. Resolves to `undefined` when the user cancels. */
  pickKeyFile(): Promise<string | undefined> {
    return this.dialog.pickKeyFile();
  }

  /** `keyFilePath` is for vaults that need a key file as well as (or instead of) a password. */
  async openExistingVault(
    masterPassword: string,
    keyFilePath?: string,
  ): Promise<OpenedVault | undefined> {
    const filePath = await this.dialog.pickVaultToOpen();
    if (!filePath) {
      return undefined;
    }

    const vault = await this.unlock(filePath, masterPassword, keyFilePath);
    return { vault, filePath, keyFilePath };
  }

  /** Prompts for where to save a key file generated for a new vault called `vaultName`. */
  pickPathForNewKeyFile(vaultName: string): Promise<string | undefined> {
    return this.dialog.pickPathForNewKeyFile(vaultName);
  }

  /**
   * Creates a vault locked with `masterPassword`, plus a key file when
   * `keyFile` is given: either a newly generated one written to its path, or
   * an existing file used as-is.
   */
  async createNewVault(
    name: string,
    masterPassword: string,
    keyFile?: NewVaultKeyFile,
  ): Promise<OpenedVault | undefined> {
    const filePath = await this.dialog.pickPathForNewVault(name);
    if (!filePath) {
      return undefined;
    }

    const keyFileBytes = keyFile && (await this.prepareKeyFile(keyFile));
    const session = await this.repository.createVault(name, {
      password: masterPassword,
      keyFile: keyFileBytes,
    });
    const fileBytes = await session.save(session.vault);
    await this.fileStorage.writeFile(filePath, fileBytes);
    this.session = session;
    this.keyFile = keyFileBytes;
    await this.rememberMtime(filePath);
    return { vault: session.vault, filePath, keyFilePath: keyFile?.path };
  }

  /**
   * A generated key file is written before the vault that depends on it: if
   * the vault write then fails, what's left is a stray key file, not a vault
   * nothing can open.
   */
  private async prepareKeyFile(keyFile: NewVaultKeyFile): Promise<ArrayBuffer> {
    if (keyFile.kind === "existing") {
      return this.readKeyFile(keyFile.path);
    }
    const bytes = await this.repository.generateKeyFile();
    await this.fileStorage.writeFile(keyFile.path, bytes);
    return bytes;
  }

  /**
   * Re-opens a previously-opened vault at a known path without prompting the
   * file dialog again, for unlocking a remembered/recent vault.
   */
  openVaultAtPath(filePath: string, masterPassword: string, keyFilePath?: string): Promise<Vault> {
    return this.unlock(filePath, masterPassword, keyFilePath);
  }

  private async unlock(
    filePath: string,
    masterPassword: string,
    keyFilePath: string | undefined,
  ): Promise<Vault> {
    const fileBytes = await this.fileStorage.readFile(filePath);
    const keyFile = keyFilePath === undefined ? undefined : await this.readKeyFile(keyFilePath);
    this.session = await this.repository.openVault(fileBytes, {
      password: masterPassword,
      keyFile,
    });
    this.keyFile = keyFile;
    await this.rememberMtime(filePath);
    return this.session.vault;
  }

  /**
   * A remembered key file can have been moved or deleted since, and the raw
   * filesystem error for that says nothing about which file it was.
   */
  private async readKeyFile(keyFilePath: string): Promise<ArrayBuffer> {
    try {
      return await this.fileStorage.readFile(keyFilePath);
    } catch (cause) {
      throw new Error(`Couldn't read the key file at ${keyFilePath}. Choose it again.`, {
        cause,
      });
    }
  }

  /**
   * Drops the open vault's document, for locking. The session holds the
   * parsed file — every decrypted secret included — so keeping it past a
   * lock would leave those secrets reachable until the next open. Unlocking
   * again re-reads and re-decrypts the file from disk.
   */
  closeVault(): void {
    this.session = undefined;
    this.keyFile = undefined;
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
   *
   * Resolves to the vault as saved, which is what callers should carry on
   * from: the save can add to it, e.g. the history revision an edit pushes.
   */
  async saveVault(vault: Vault, filePath: string, options: SaveVaultOptions = {}): Promise<Vault> {
    const fileExists = await this.fileStorage.exists(filePath);

    if (!options.force) {
      await this.assertNoConflict(filePath, fileExists);
    }

    // Serialize before touching any backup: a failure here must not have already
    // rotated the older backups out in favour of copies of the current file.
    const session = this.openSession();
    const fileBytes = await session.save(vault);

    if (fileExists) {
      await this.rotateBackups(filePath);
    }

    await this.fileStorage.writeFile(filePath, fileBytes);
    await this.rememberMtime(filePath);
    // The session read at the start: locking mid-save drops `this.session`,
    // but the file has still been written.
    return session.vault;
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
   *
   * Then re-keys the rolling backups too: they're still encrypted with the old
   * password, and a change made because that password leaked shouldn't leave
   * three copies of the vault it still opens. See `rekeyBackups`.
   */
  async changeMasterPassword(
    vault: Vault,
    filePath: string,
    currentMasterPassword: string,
    newMasterPassword: string,
  ): Promise<MasterPasswordChangeResult> {
    await this.assertNoConflict(filePath, await this.fileStorage.exists(filePath));
    await this.openSession().changeMasterPassword(currentMasterPassword, newMasterPassword);
    await this.saveVault(vault, filePath);
    const keyFile = this.keyFile;
    return this.rekeyBackups(
      filePath,
      { password: currentMasterPassword, keyFile },
      { password: newMasterPassword, keyFile },
    );
  }

  /**
   * Adds, replaces or removes the open vault's key file and immediately
   * persists it via `saveVault`, then re-keys the rolling backups to match,
   * for the same reasons as `changeMasterPassword`. The master password stays
   * as it is; `currentMasterPassword` is only checked.
   *
   * A generated key file is written before the vault that depends on it, as
   * in `createNewVault`. If the key file or the vault then can't be written,
   * the open document goes back to its previous key file, so that a later
   * save doesn't lock the vault with one that was never saved.
   */
  async changeKeyFile(
    vault: Vault,
    filePath: string,
    currentMasterPassword: string,
    change: KeyFileChange,
  ): Promise<KeyFileChangeResult> {
    const session = this.openSession();
    await this.assertNoConflict(filePath, await this.fileStorage.exists(filePath));

    const previous = this.keyFile;
    const next = await this.keyFileBytesFor(change);
    await session.changeKeyFile(currentMasterPassword, next);
    try {
      if (change.kind === "generate") {
        await this.fileStorage.writeFile(change.path, next!);
      }
      await this.saveVault(vault, filePath);
    } catch (cause) {
      await session.changeKeyFile(currentMasterPassword, previous);
      throw cause;
    }
    this.keyFile = next;

    const backups = await this.rekeyBackups(
      filePath,
      { password: currentMasterPassword, keyFile: previous },
      { password: currentMasterPassword, keyFile: next },
    );
    return { ...backups, keyFilePath: change.kind === "remove" ? undefined : change.path };
  }

  private async keyFileBytesFor(change: KeyFileChange): Promise<ArrayBuffer | undefined> {
    switch (change.kind) {
      case "remove":
        return undefined;
      case "existing":
        return this.readKeyFile(change.path);
      case "generate":
        return this.repository.generateKeyFile();
    }
  }

  /**
   * Applies `settings` to the open vault and immediately persists it via
   * `saveVault`. The conflict check runs first for the same reason as in
   * `changeMasterPassword`. If the save fails, the open document goes back to
   * the settings it had, so that a later save doesn't quietly apply them.
   *
   * Resolves to the vault as saved, like `saveVault`.
   */
  async changeVaultSettings(
    vault: Vault,
    filePath: string,
    settings: VaultSettings,
  ): Promise<Vault> {
    const session = this.openSession();
    await this.assertNoConflict(filePath, await this.fileStorage.exists(filePath));
    const previous = session.settings;
    session.applySettings(settings);
    try {
      return await this.saveVault(vault, filePath);
    } catch (cause) {
      session.applySettings(previous);
      throw cause;
    }
  }

  /**
   * Upgrades the open vault from KDBX 3 to KDBX 4 and immediately persists it
   * via `saveVault`. The conflict check runs before the upgrade for the same
   * reason as in `changeMasterPassword`: the upgrade changes the open
   * document, which a conflict found afterwards would leave out of step with
   * the file on disk.
   *
   * First copies the KDBX 3 file to `<path>.kdbx3-backup.kdbx`, overwriting
   * any copy an earlier upgrade left. `.bak1` gets it too, but only until three
   * more saves rotate it out; this copy stays until the user deletes it. A
   * failed copy stops the upgrade before the file is touched.
   *
   * Resolves to the vault as saved, like `saveVault`.
   */
  async upgradeVaultFormat(vault: Vault, filePath: string): Promise<Vault> {
    const session = this.openSession();
    const fileExists = await this.fileStorage.exists(filePath);
    await this.assertNoConflict(filePath, fileExists);
    if (fileExists) {
      await this.fileStorage.grantAccess(filePath, KDBX3_COPY_SUFFIX);
      await this.fileStorage.copyFile(filePath, filePath + KDBX3_COPY_SUFFIX);
    }
    session.upgradeFormat();
    return this.saveVault(vault, filePath);
  }

  /**
   * Re-encrypts each existing backup of `filePath` under the new key. Runs
   * only after the vault itself has been saved, and never throws: the key
   * change has already happened by then, and reporting it as failed would
   * leave the user not knowing what opens their vault.
   *
   * A backup that can't be re-keyed -- most likely one the old key doesn't
   * open, written by another app or left over from an earlier password -- is
   * removed rather than left in an unknown state. One that
   * can be neither re-keyed nor removed is reported back so the user can deal
   * with it by hand.
   */
  private async rekeyBackups(
    filePath: string,
    currentKey: VaultKey,
    newKey: VaultKey,
  ): Promise<MasterPasswordChangeResult> {
    const result: MasterPasswordChangeResult = { removedBackups: [], unprotectedBackups: [] };
    for (const suffix of BACKUP_SUFFIXES) {
      const backupPath = filePath + suffix;
      try {
        await this.fileStorage.grantAccess(filePath, suffix);
        if (!(await this.fileStorage.exists(backupPath))) {
          continue;
        }
      } catch {
        result.unprotectedBackups.push(backupPath);
        continue;
      }

      try {
        const oldBytes = await this.fileStorage.readFile(backupPath);
        const newBytes = await this.repository.rekeyFile(oldBytes, currentKey, newKey);
        await this.fileStorage.writeFile(backupPath, newBytes);
      } catch {
        try {
          await this.fileStorage.removeFile(backupPath);
          result.removedBackups.push(backupPath);
        } catch {
          result.unprotectedBackups.push(backupPath);
        }
      }
    }
    return result;
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

  /**
   * Current on-disk size and last-modified time of the open vault, saved at
   * `filePath`, along with what the open document says about itself.
   */
  async getFileInfo(filePath: string): Promise<VaultFileInfo> {
    const { format, settings } = this.openSession();
    const hasKeyFile = this.keyFile !== undefined;
    const [sizeBytes, lastModifiedMs] = await Promise.all([
      this.fileStorage.size(filePath),
      this.fileStorage.lastModified(filePath),
    ]);
    return { sizeBytes, lastModifiedMs, format, hasKeyFile, settings };
  }

  private async rotateBackups(filePath: string): Promise<void> {
    // Backup paths are derived here rather than picked by the user, so the OS
    // layer has to be told about them before they can be read or written.
    for (const suffix of BACKUP_SUFFIXES) {
      await this.fileStorage.grantAccess(filePath, suffix);
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
