/**
 * Native file-picker prompts for vault files. Implemented in
 * `infrastructure` against the Tauri dialog API. Both methods resolve to
 * `undefined` when the user dismisses the dialog without choosing a path.
 */
export interface VaultFileDialog {
  pickVaultToOpen(): Promise<string | undefined>;
  pickPathForNewVault(): Promise<string | undefined>;
}
