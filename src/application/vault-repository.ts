import { Vault } from "../domain";

/**
 * Thrown by `changeMasterPassword` when `currentMasterPassword` doesn't
 * match the currently open vault's credentials, so callers can show a
 * validation error instead of re-keying the vault.
 */
export class IncorrectMasterPasswordError extends Error {
  constructor() {
    super("Current password is incorrect.");
    this.name = "IncorrectMasterPasswordError";
  }
}

/**
 * One opened vault document, live for as long as it stays open.
 *
 * Saving and re-keying hang off the session rather than off the repository
 * so that "open it first" is a thing the types say, not a runtime check: you
 * cannot call `save` without already holding the result of an open.
 *
 * The session keeps the parsed document alive between `open` and `save`,
 * which is what lets fields the domain model doesn't expose (attachments,
 * custom icons, entry history, ...) round-trip untouched instead of being
 * dropped when the file is rebuilt from the intentionally lossy domain model.
 */
export interface VaultSession {
  /** The vault as parsed when it was opened. */
  readonly vault: Vault;
  /** Applies `vault`'s tree onto the open document and serializes it. */
  save(vault: Vault): Promise<ArrayBuffer>;
  /**
   * Re-keys the open document with a new master password, after verifying
   * `currentMasterPassword` against its existing credentials. Throws
   * `IncorrectMasterPasswordError` if it doesn't match. Doesn't persist
   * anything by itself; follow with `save`.
   */
  changeMasterPassword(currentMasterPassword: string, newMasterPassword: string): Promise<void>;
}

/** Opens and creates KDBX vault documents. Holds no state of its own. */
export interface VaultRepository {
  openVault(fileBytes: ArrayBuffer, masterPassword: string): Promise<VaultSession>;
  createVault(name: string, masterPassword: string): Promise<VaultSession>;
  /**
   * Re-encrypts a whole vault file under `newMasterPassword` without opening
   * it as a session or mapping it through the domain model, so everything
   * but the credentials comes back out unchanged. For re-keying the backups
   * that sit next to a vault whose password just changed. Rejects if
   * `currentMasterPassword` doesn't open `fileBytes`.
   */
  rekeyFile(
    fileBytes: ArrayBuffer,
    currentMasterPassword: string,
    newMasterPassword: string,
  ): Promise<ArrayBuffer>;
}
