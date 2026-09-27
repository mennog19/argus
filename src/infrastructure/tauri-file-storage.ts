import { invoke } from "@tauri-apps/api/core";
import { copyFile, exists, readFile, stat } from "@tauri-apps/plugin-fs";
import { FileStorage } from "../application/file-storage";

/** `FileStorage` backed by Tauri's filesystem plugin. */
export class TauriFileStorage implements FileStorage {
  async readFile(path: string): Promise<ArrayBuffer> {
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /**
   * Goes through the app's own `write_file_atomic` command rather than
   * plugin-fs `writeFile`, which truncates the file and then writes into it: a
   * crash mid-write would leave a corrupt `.kdbx`. The command stages the bytes
   * in a temp file and renames it into place, so the file is always either
   * entirely the old contents or entirely the new.
   */
  async writeFile(path: string, data: ArrayBuffer): Promise<void> {
    await invoke("write_file_atomic", new Uint8Array(data), {
      headers: { path: encodeURIComponent(path) },
    });
  }

  async exists(path: string): Promise<boolean> {
    return exists(path);
  }

  async lastModified(path: string): Promise<number> {
    const info = await stat(path);
    return info.mtime?.getTime() ?? 0;
  }

  async size(path: string): Promise<number> {
    const info = await stat(path);
    return info.size;
  }

  async copyFile(source: string, destination: string): Promise<void> {
    await copyFile(source, destination);
  }

  /**
   * Widens Tauri's filesystem scope to `basePath + suffix` via the app's own
   * `grant_file_access` command. Without it, plugin-fs rejects every path the
   * user didn't pick in a dialog, including the vault's sibling backups.
   */
  async grantAccess(basePath: string, suffix: string): Promise<void> {
    await invoke("grant_file_access", { anchor: basePath, suffix });
  }
}
