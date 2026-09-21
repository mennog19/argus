import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowEvents } from "../application/window-events";

/** `WindowEvents` backed by the Tauri window API: a resize down to minimized counts as a minimize. */
export class TauriWindowEvents implements WindowEvents {
  onMinimize(callback: () => void): () => void {
    const window = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void window
      .onResized(() => {
        void window.isMinimized().then((minimized) => {
          if (minimized) {
            callback();
          }
        });
      })
      .then((fn) => {
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
}
