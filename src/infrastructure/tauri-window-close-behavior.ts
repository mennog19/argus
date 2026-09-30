import { invoke } from "@tauri-apps/api/core";
import { WindowCloseBehavior } from "../application/window-close-behavior";

/**
 * `WindowCloseBehavior` backed by the Rust side (`tray.rs`), which shows or
 * removes the tray icon and decides what a close request does.
 */
export class TauriWindowCloseBehavior implements WindowCloseBehavior {
  async setCloseToTray(enabled: boolean): Promise<void> {
    await invoke("set_close_to_tray", { enabled });
  }
}
