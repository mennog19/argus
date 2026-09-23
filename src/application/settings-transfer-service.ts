import { FileStorage } from "./file-storage";
import { AppSettings } from "./settings";
import { SettingsFileDialog } from "./settings-file-dialog";
import {
  applyPortableSettings,
  parsePortableSettings,
  serializePortableSettings,
  toPortableSettings,
} from "./settings-transfer";

/** The settings an import produced, plus the file they came from. */
export interface ImportedSettings {
  readonly settings: AppSettings;
  readonly filePath: string;
}

/**
 * Writes the shareable settings to a JSON file the user picks, and reads one
 * back in. Like the other services here, returns `undefined` when the user
 * cancels the file dialog so callers can tell "cancelled" from "failed".
 */
export class SettingsTransferService {
  constructor(
    private readonly dialog: SettingsFileDialog,
    private readonly fileStorage: FileStorage,
  ) {}

  /** Returns the path written to, or `undefined` if the user cancelled. */
  async exportSettings(settings: AppSettings): Promise<string | undefined> {
    const filePath = await this.dialog.pickPathForExport();
    if (!filePath) {
      return undefined;
    }

    const text = serializePortableSettings(toPortableSettings(settings));
    await this.fileStorage.writeFile(
      filePath,
      new TextEncoder().encode(text).buffer as ArrayBuffer,
    );
    return filePath;
  }

  /**
   * Returns `settings` with every shareable setting replaced by the picked
   * file's, or `undefined` if the user cancelled. Throws
   * `SettingsImportError` when the file isn't a usable settings file.
   */
  async importSettings(settings: AppSettings): Promise<ImportedSettings | undefined> {
    const filePath = await this.dialog.pickFileToImport();
    if (!filePath) {
      return undefined;
    }

    const bytes = await this.fileStorage.readFile(filePath);
    const portable = parsePortableSettings(new TextDecoder().decode(bytes));
    return { settings: applyPortableSettings(settings, portable), filePath };
  }
}
