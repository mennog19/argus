import { Vault } from "../domain";

export interface OpenedMergeSource {
  readonly vault: Vault;
  readonly filePath: string;
}

/**
 * Opens a second, independent `.kdbx` file for the merge wizard to compare
 * against the vault that's currently open. Implemented in `infrastructure`
 * against its own throwaway `VaultRepository` instance, kept entirely
 * separate from the one backing the open vault, so reading a merge source
 * never disturbs the target vault's live document (and the KDBX-fidelity
 * fields riding along with it) before it's saved.
 */
export interface VaultMergeSource {
  /**
   * Prompts the native file dialog, then opens the chosen file with
   * `masterPassword`. Resolves to `undefined` when the user cancels the
   * dialog instead of throwing, mirroring `VaultAccessService.openExistingVault`.
   */
  pickAndOpen(masterPassword: string): Promise<OpenedMergeSource | undefined>;
}
