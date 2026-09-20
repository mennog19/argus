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
  copyFile(source: string, destination: string): Promise<void>;
}
