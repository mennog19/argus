import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowProtection } from "../application/window-protection";

/**
 * `WindowProtection` backed by the Tauri window API. Uses
 * `WDA_EXCLUDEFROMCAPTURE` on Windows and `NSWindowSharingType.none` on
 * macOS, so the window is invisible to screen recordings, screenshots, and
 * screen-share/remote-desktop apps.
 */
export class TauriWindowProtection implements WindowProtection {
  async setContentProtected(protect: boolean): Promise<void> {
    await getCurrentWindow().setContentProtected(protect);
  }
}
