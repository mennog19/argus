import { invoke } from "@tauri-apps/api/core";
import { ClipboardWriter } from "../application/clipboard";

/**
 * `ClipboardWriter` backed by the `clipboard_write_secret` /
 * `clipboard_clear_secret` Tauri commands. They set the Windows formats that
 * keep a copy out of clipboard history, and only wipe the clipboard while it
 * still holds what Argus put there.
 */
export class TauriClipboard implements ClipboardWriter {
  async writeText(value: string): Promise<number> {
    return invoke<number>("clipboard_write_secret", { text: value });
  }

  async clearIfUnchanged(copyId: number): Promise<void> {
    await invoke("clipboard_clear_secret", { copy: copyId });
  }
}
