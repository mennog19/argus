import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ClipboardWriter } from "../application/clipboard";

/** `ClipboardWriter` backed by Tauri's clipboard-manager plugin. */
export class TauriClipboard implements ClipboardWriter {
  async writeText(value: string): Promise<void> {
    await writeText(value);
  }
}
