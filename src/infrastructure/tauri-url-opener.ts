import { openUrl } from "@tauri-apps/plugin-opener";
import { UrlOpener } from "../application/url-opener";

/** `UrlOpener` backed by Tauri's opener plugin (opens in the OS default browser). */
export class TauriUrlOpener implements UrlOpener {
  async open(url: string): Promise<void> {
    await openUrl(url);
  }
}
