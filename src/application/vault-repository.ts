import { Vault } from "../domain";

/**
 * Persists vaults to/from the KDBX file format. `openVault` and `saveVault`
 * operate on the same underlying file across a session (see the
 * `infrastructure` implementation) so that fields the domain model doesn't
 * expose yet (attachments, custom icons, entry history, ...) round-trip
 * untouched instead of being dropped on save.
 */
export interface VaultRepository {
  openVault(fileBytes: ArrayBuffer, masterPassword: string): Promise<Vault>;
  createVault(name: string, masterPassword: string): Promise<Vault>;
  saveVault(vault: Vault): Promise<ArrayBuffer>;
  /**
   * When a password was last changed for every entry in the currently open
   * vault, keyed by `EntryId.toString()`. The domain `Entry` doesn't carry
   * this timestamp itself (see `EntryPasswordAge`), so callers that need it
   * (the password health check) ask the repository directly.
   */
  getPasswordChangedTimes(): Map<string, Date>;
}
