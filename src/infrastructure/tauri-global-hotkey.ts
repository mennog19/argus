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

  /**
   * Serializes every claim and release against the OS.
   *
   * Callers fire these without awaiting — a React effect cleanup releases the
   * old accelerator while the next effect immediately claims one. Left
   * concurrent, the release can resolve *after* the claim and hand the OS
   * back a combination Argus has just re-taken, leaving `bound` insisting on
   * a registration that no longer fires. Queueing makes the order the call
   * order.
   */
  private queue: Promise<void> = Promise.resolve();

  register(accelerator: string, handler: () => void): Promise<void> {
    return this.enqueue(async () => {
      await this.releaseBound();
      // The plugin reports key-up as well; auto-type should fire once, on press.
      await registerShortcut(accelerator, (event) => {
        if (event.state === "Pressed") {
          handler();
        }
      });
      this.bound = accelerator;
    });
  }

  unregister(): Promise<void> {
    return this.enqueue(() => this.releaseBound());
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    // The queue itself swallows failures so one rejected claim doesn't block
    // every later one; the caller still gets `result`, rejection and all.
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async releaseBound(): Promise<void> {
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
