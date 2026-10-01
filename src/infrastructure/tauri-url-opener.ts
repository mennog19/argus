import { openUrl } from "@tauri-apps/plugin-opener";
import { UrlOpener } from "../application/url-opener";

export class TauriUrlOpener implements UrlOpener {
  async open(url: string): Promise<void> {
    await openUrl(url);
  }
}
