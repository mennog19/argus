/**
 * Opens a URL in the OS default browser. Implemented in `infrastructure`
 * against the Tauri opener plugin, so entry URLs don't navigate the app's
 * own webview away from the vault.
 */
export interface UrlOpener {
  open(url: string): Promise<void>;
}
