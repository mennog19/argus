import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from "../application/settings";

const SETTINGS_FILE = "settings.json";

/**
 * `SettingsStore` backed by a JSON file in the OS app-data directory. Falls
 * back to `DEFAULT_SETTINGS` when the file doesn't exist yet (first launch)
 * or can't be parsed (corrupted on disk) rather than throwing, since a
 * missing/corrupt settings file shouldn't block opening the app.
 */
export class JsonSettingsStore implements SettingsStore {
  async load(): Promise<AppSettings> {
    const fileExists = await exists(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
    if (!fileExists) {
      return DEFAULT_SETTINGS;
    }

    const contents = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
    try {
      return JSON.parse(contents) as AppSettings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
  }
}
