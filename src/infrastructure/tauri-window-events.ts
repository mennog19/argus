import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowEvents } from "../application/window-events";
import { unsubscribeOnceRegistered } from "./tauri-listener";

/** Emitted by the Rust side (`session_lock.rs`) when the OS session locks. */
const SESSION_LOCKED_EVENT = "session-locked";

/** Emitted by the Rust side (`tray.rs`) when closing hid the window to the tray. */
const HIDDEN_TO_TRAY_EVENT = "hidden-to-tray";

/**
 * `WindowEvents` backed by the Tauri window API: a resize down to minimized
 * counts as a minimize, and so does closing the window to the tray, which
 * takes it out of sight just the same. Tray hides and session locks come
 * from the Rust side, which is the only place that can see them.
 */
export class TauriWindowEvents implements WindowEvents {
  onMinimize(callback: () => void): () => void {
    const window = getCurrentWindow();
    const unsubscribeResize = unsubscribeOnceRegistered(
      window.onResized(() => {
        void window.isMinimized().then((minimized) => {
          if (minimized) {
            callback();
          }
        });
      }),
    );
    const unsubscribeTray = unsubscribeOnceRegistered(
      listen(HIDDEN_TO_TRAY_EVENT, () => callback()),
    );
    return () => {
      unsubscribeResize();
      unsubscribeTray();
    };
  }

  onSessionLock(callback: () => void): () => void {
    return unsubscribeOnceRegistered(listen(SESSION_LOCKED_EVENT, () => callback()));
  }
}
