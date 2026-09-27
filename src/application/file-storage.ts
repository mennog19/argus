/**
 * Reads/writes raw file bytes at an OS path. Implemented in `infrastructure`
 * against the Tauri filesystem API; kept separate from `VaultRepository` so
 * that use cases can be unit-tested against a fake without pulling in
 * `kdbxweb`.
 */
export interface FileStorage {
  readFile(path: string): Promise<ArrayBuffer>;
  writeFile(path: string, data: ArrayBuffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Last-modified time of the file at `path`, in epoch milliseconds. */
  lastModified(path: string): Promise<number>;
  /** Size of the file at `path`, in bytes. */
  size(path: string): Promise<number>;
  copyFile(source: string, destination: string): Promise<void>;
  /**
   * Asks the OS layer for access to `basePath + suffix` before it is read or
   * written. Needed for the rolling-backup paths the app derives itself
   * (e.g. `<vault>.bak1`) rather than ones the user picked in a file dialog.
   * `basePath` must already be accessible -- the vault the backup sits next
   * to -- so this can't be used to grant an arbitrary path; a no-op where
   * the platform doesn't sandbox file access.
   */
  grantAccess(basePath: string, suffix: string): Promise<void>;
}
