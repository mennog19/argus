import { copyFile, exists, readFile, stat, writeFile } from "@tauri-apps/plugin-fs";
import { FileStorage } from "../application/file-storage";

/** `FileStorage` backed by Tauri's filesystem plugin. */
export class TauriFileStorage implements FileStorage {
  async readFile(path: string): Promise<ArrayBuffer> {
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  async writeFile(path: string, data: ArrayBuffer): Promise<void> {
    await writeFile(path, new Uint8Array(data));
  }

  async exists(path: string): Promise<boolean> {
    return exists(path);
  }

  async lastModified(path: string): Promise<number> {
    const info = await stat(path);
    return info.mtime?.getTime() ?? 0;
  }

  async copyFile(source: string, destination: string): Promise<void> {
    await copyFile(source, destination);
  }
}
