import { open, save } from "@tauri-apps/plugin-dialog";
import { SettingsFileDialog } from "../application/settings-file-dialog";

const JSON_FILTERS = [{ name: "Argus Settings", extensions: ["json"] }];

const DEFAULT_EXPORT_FILE_NAME = "argus-settings.json";

/** `SettingsFileDialog` backed by Tauri's native file-picker plugin. */
export class TauriSettingsFileDialog implements SettingsFileDialog {
  async pickPathForExport(): Promise<string | undefined> {
    const path = await save({ filters: JSON_FILTERS, defaultPath: DEFAULT_EXPORT_FILE_NAME });
    return path ?? undefined;
  }

  async pickFileToImport(): Promise<string | undefined> {
    const path = await open({ filters: JSON_FILTERS, multiple: false, directory: false });
    return path ?? undefined;
  }
}
