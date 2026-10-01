/**
 * Native file-picker prompt for saving an attachment out of the vault.
 * Implemented in `infrastructure` against the Tauri dialog API.
 */
export interface AttachmentFileDialog {
  /**
   * Where to save a copy of an attachment; `name` seeds the suggested file
   * name. Resolves to `undefined` when the user dismisses the dialog.
   */
  pickPathForAttachment(name: string): Promise<string | undefined>;
}
