import { invoke } from "@tauri-apps/api/core";
import { AutoTyper, ForegroundWindow } from "../application/auto-type";
import { AutoTypeStep } from "../domain";

/**
 * `AutoTyper` backed by the `auto_type_capture_target` / `auto_type_send`
 * Tauri commands, which wrap the OS input APIs (`SendInput` on Windows).
 *
 * The captured target window lives in Rust rather than being passed back and
 * forth as a handle: a raw `HWND` in JavaScript would be both meaningless and
 * a way to aim keystrokes at an arbitrary window.
 */
export class TauriAutoTyper implements AutoTyper {
  async captureTarget(): Promise<ForegroundWindow | undefined> {
    const window = await invoke<ForegroundWindow | null>("auto_type_capture_target");
    return window ?? undefined;
  }

  async typeIntoTarget(steps: readonly AutoTypeStep[]): Promise<void> {
    await invoke("auto_type_send", { steps });
  }
}
