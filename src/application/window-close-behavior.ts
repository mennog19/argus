/**
 * Controls what the window's close button does: quit Argus, or hide it to
 * the system tray. Implemented in `infrastructure` against the Rust side,
 * which owns the tray icon and intercepts the close.
 */
export interface WindowCloseBehavior {
  setCloseToTray(enabled: boolean): Promise<void>;
}
