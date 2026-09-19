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
  saveVault(vault: Vault): Promise<ArrayBuffer>;
}
