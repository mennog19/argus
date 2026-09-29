import { invoke } from "@tauri-apps/api/core";
import { AutoTyper, ForegroundWindow } from "../application/auto-type";
import { AutoTypeStep, FormLayout } from "../domain";

/** `ForegroundWindow` as `auto_type_capture_target` serializes it. */
interface CapturedWindow {
  readonly title: string;
  readonly processName: string;
  readonly isBrowser: boolean;
  readonly url: string | null;
}

/**
 * `AutoTyper` backed by the `auto_type_capture_target` / `auto_type_inspect_target` /
 * `auto_type_send` Tauri commands, which wrap the OS input APIs (`SendInput`
 * and UI Automation on Windows).
 *
 * The captured target window lives in Rust rather than being passed back and
 * forth as a handle: a raw `HWND` in JavaScript would be both meaningless and
 * a way to aim keystrokes at an arbitrary window.
 */
export class TauriAutoTyper implements AutoTyper {
  async captureTarget(): Promise<ForegroundWindow | undefined> {
    const window = await invoke<CapturedWindow | null>("auto_type_capture_target");
    if (!window) {
      return undefined;
    }
    const { url, ...rest } = window;
    // Rust's `None` arrives as null; the port only knows "absent".
    return url === null ? rest : { ...rest, url };
  }

  async inspectTarget(): Promise<FormLayout> {
    return invoke<FormLayout>("auto_type_inspect_target");
  }

  async typeIntoTarget(steps: readonly AutoTypeStep[]): Promise<void> {
    await invoke("auto_type_send", { steps });
  }
}
