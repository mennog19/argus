/**
 * Vaults the OS asks Argus to open, e.g. by double-clicking a `.kdbx` file.
 * Implemented in `infrastructure` against the Tauri backend.
 */
export interface VaultOpenRequests {
  /**
   * Calls `callback` with the path of each vault Argus is asked to open: the
   * one it was launched with, if any, and any asked for while it is running.
   * Returns a function that unsubscribes.
   */
  onOpenRequest(callback: (filePath: string) => void): () => void;
}
