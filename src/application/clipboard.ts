/**
 * Writes text to the OS clipboard. Implemented in `infrastructure` against
 * Tauri's clipboard-manager plugin, so username/password copy buttons and
 * the auto-clear timer don't touch the web clipboard API directly.
 */
export interface ClipboardWriter {
  writeText(value: string): Promise<void>;
}
