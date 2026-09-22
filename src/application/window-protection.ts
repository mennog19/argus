/**
 * Controls whether the app window's contents can be captured by other apps
 * (screen recorders, screen-share/remote-desktop tools, OS screenshot
 * pickers). Implemented in `infrastructure` against the Tauri window API.
 */
export interface WindowProtection {
  setContentProtected(protect: boolean): Promise<void>;
}
