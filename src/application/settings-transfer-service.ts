import { FileStorage } from "./file-storage";
import { AppSettings, resolveSettings } from "./settings";
import { SettingsFileDialog } from "./settings-file-dialog";
import {
  applyPortableSettings,
  parsePortableSettings,
  serializePortableSettings,
  toPortableSettings,
} from "./settings-transfer";

/** What an import did, for the settings screen to report. */
export interface SettingsImportResult {
  readonly filePath: string;
  /**
   * The file would have turned screen-capture protection off, and Argus kept
   * it on instead. Only the user switching it off themselves turns it off.
   */
  readonly keptContentProtection: boolean;
}

/** The settings an import produced, plus what to tell the user about it. */
export interface ImportedSettings extends SettingsImportResult {
  readonly settings: AppSettings;
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
   *
   * The one exception is screen-capture protection: a file can turn it on
   * but never off. A settings file is something people are sent, and
   * quietly making the vault window recordable is exactly what a malicious
   * one would want.
   */
  async importSettings(settings: AppSettings): Promise<ImportedSettings | undefined> {
    const filePath = await this.dialog.pickFileToImport();
    if (!filePath) {
      return undefined;
    }

    const bytes = await this.fileStorage.readFile(filePath);
    const portable = parsePortableSettings(new TextDecoder().decode(bytes));
    const applied = applyPortableSettings(settings, portable);
    const keptContentProtection =
      resolveSettings(settings).contentProtection && !portable.security.contentProtection;
    return {
      settings: keptContentProtection ? { ...applied, contentProtection: true } : applied,
      filePath,
      keptContentProtection,
    };
  }
}
