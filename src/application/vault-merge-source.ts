import { Vault } from "../domain";

/**
 * Opens a second, independent `.kdbx` file for the merge wizard to compare
 * against the vault that's currently open. Implemented in `infrastructure`
 * against its own throwaway `VaultRepository` instance, kept entirely
 * separate from the one backing the open vault, so reading a merge source
 * never disturbs the target vault's live document (and the KDBX-fidelity
 * fields riding along with it) before it's saved.
 *
 * Picking and unlocking are two calls so the UI can ask for the file first
 * and only prompt for a master password once there's a file to unlock.
 */
export interface VaultMergeSource {
  /**
   * Prompts the native file dialog. Resolves to `undefined` when the user
   * cancels instead of throwing, mirroring `VaultAccessService.openExistingVault`.
   */
  pickFile(): Promise<string | undefined>;
  /** Reads and decrypts `filePath`. Throws if the password is wrong. */
  openFile(filePath: string, masterPassword: string): Promise<Vault>;
}
