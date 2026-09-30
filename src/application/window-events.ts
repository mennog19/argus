/**
 * Notifies about OS window state changes relevant to auto-lock. Implemented
 * in `infrastructure` against the Tauri window API.
 */
export interface WindowEvents {
  /** Calls `callback` when the app window is minimized. Returns a function that unsubscribes. */
  onMinimize(callback: () => void): () => void;
  /** Calls `callback` when the OS session is locked (e.g. Win+L). Returns a function that unsubscribes. */
  onSessionLock(callback: () => void): () => void;
}
