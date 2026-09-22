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
 * Persists vaults to/from the KDBX file format. `openVault`, `saveVault`,
 * and `changeMasterPassword` operate on the same underlying file across a
 * session (see the `infrastructure` implementation) so that fields the
 * domain model doesn't expose yet (attachments, custom icons, entry
 * history, ...) round-trip untouched instead of being dropped on save.
 */
export interface VaultRepository {
  openVault(fileBytes: ArrayBuffer, masterPassword: string): Promise<Vault>;
  createVault(name: string, masterPassword: string): Promise<Vault>;
  saveVault(vault: Vault): Promise<ArrayBuffer>;
  /**
   * Re-keys the currently open vault with a new master password, after
   * verifying `currentMasterPassword` against its existing credentials.
   * Throws `IncorrectMasterPasswordError` if it doesn't match. Doesn't
   * persist anything to disk by itself; follow with `saveVault`.
   */
  changeMasterPassword(currentMasterPassword: string, newMasterPassword: string): Promise<void>;
}
