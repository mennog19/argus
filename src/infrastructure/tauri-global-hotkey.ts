import {
  register as registerShortcut,
  unregister as unregisterShortcut,
} from "@tauri-apps/plugin-global-shortcut";
import { GlobalHotkey } from "../application/auto-type";

/**
 * `GlobalHotkey` backed by Tauri's global-shortcut plugin.
 *
 * Holds at most one accelerator at a time and releases the previous one
 * before claiming a new one, so re-binding from settings can't leak
 * registrations that keep firing at an old combination.
 */
export class TauriGlobalHotkey implements GlobalHotkey {
  private bound: string | undefined;

  async register(accelerator: string, handler: () => void): Promise<void> {
    await this.unregister();
    // The plugin reports key-up as well; auto-type should fire once, on press.
    await registerShortcut(accelerator, (event) => {
      if (event.state === "Pressed") {
        handler();
      }
    });
    this.bound = accelerator;
  }

  async unregister(): Promise<void> {
    const accelerator = this.bound;
    if (accelerator === undefined) {
      return;
    }
    // Cleared first so a failing unregister can't strand `bound` on a
    // shortcut the OS has already let go of.
    this.bound = undefined;
    await unregisterShortcut(accelerator);
  }
}
