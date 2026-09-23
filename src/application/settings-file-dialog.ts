/**
 * Native file-picker prompts for the exported settings file. Implemented in
 * `infrastructure` against the Tauri dialog API. Both methods resolve to
 * `undefined` when the user dismisses the dialog without choosing a path.
 */
export interface SettingsFileDialog {
  pickPathForExport(): Promise<string | undefined>;
  pickFileToImport(): Promise<string | undefined>;
}
