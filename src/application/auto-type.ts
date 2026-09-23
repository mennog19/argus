import { AutoTypeStep } from "../domain";

/** The window that was focused when the auto-type hotkey was pressed. */
export interface ForegroundWindow {
  /** The window's caption — for a browser, usually "<page title> — <browser>". */
  readonly title: string;
  /** The owning executable, e.g. `chrome.exe`. Shown so the user can see where input will land. */
  readonly processName: string;
}

/**
 * Types synthetic keystrokes into whichever window was focused before Argus
 * took focus. Implemented in `infrastructure` against the Tauri command that
 * wraps the OS input APIs.
 *
 * Split into two calls on purpose: `captureTarget` has to run while the other
 * app still owns the foreground (i.e. the instant the hotkey fires), whereas
 * `typeIntoTarget` runs after the user has picked an entry in Argus's own
 * window and restores focus to the remembered target first.
 */
export interface AutoTyper {
  /**
   * Records the current foreground window as the auto-type target and
   * describes it. Returns undefined when there's nothing to type into —
   * Argus itself is in front, or the OS reports no foreground window.
   */
  captureTarget(): Promise<ForegroundWindow | undefined>;

  /** Refocuses the captured target and plays `steps` into it. */
  typeIntoTarget(steps: readonly AutoTypeStep[]): Promise<void>;
}

/**
 * Registers an OS-wide hotkey that fires while Argus is in the background.
 * Implemented in `infrastructure` against Tauri's global-shortcut plugin.
 */
export interface GlobalHotkey {
  /**
   * Binds `accelerator` (e.g. `"CommandOrControl+Shift+A"`), replacing any
   * previous binding. Rejects when the OS refuses it — most often because
   * another application already holds that combination.
   */
  register(accelerator: string, handler: () => void): Promise<void>;

  /** Releases whatever this instance currently holds. Safe to call when nothing is bound. */
  unregister(): Promise<void>;
}
