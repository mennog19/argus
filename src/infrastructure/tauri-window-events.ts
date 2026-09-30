import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowEvents } from "../application/window-events";

/** Emitted by the Rust side (`session_lock.rs`) when the OS session locks. */
const SESSION_LOCKED_EVENT = "session-locked";

/**
 * `WindowEvents` backed by the Tauri window API: a resize down to minimized
 * counts as a minimize. Session locks come from the Rust side, which is the
 * only place that can see them.
 */
export class TauriWindowEvents implements WindowEvents {
  onMinimize(callback: () => void): () => void {
    const window = getCurrentWindow();
    return unsubscribeOnceRegistered(
      window.onResized(() => {
        void window.isMinimized().then((minimized) => {
          if (minimized) {
            callback();
          }
        });
      }),
    );
  }

  onSessionLock(callback: () => void): () => void {
    return unsubscribeOnceRegistered(listen(SESSION_LOCKED_EVENT, () => callback()));
  }
}

/**
 * Tauri listeners register asynchronously; this returns a synchronous
 * unsubscribe that also works when called before registration resolves.
 */
function unsubscribeOnceRegistered(registration: Promise<UnlistenFn>): () => void {
  let unlisten: UnlistenFn | undefined;
  let cancelled = false;

  void registration.then((fn) => {
    if (cancelled) {
      fn();
    } else {
      unlisten = fn;
    }
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}
