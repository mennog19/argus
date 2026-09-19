import { readFile, writeFile } from "@tauri-apps/plugin-fs";
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
}
