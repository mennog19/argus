import { describe, expect, it, vi } from "vitest";
import { FileStorage } from "../../src/application/file-storage";
import { AppSettings, DEFAULT_SETTINGS } from "../../src/application/settings";
import { SettingsFileDialog } from "../../src/application/settings-file-dialog";
import { SettingsTransferService } from "../../src/application/settings-transfer-service";
import {
  serializePortableSettings,
  SettingsImportError,
  toPortableSettings,
} from "../../src/application/settings-transfer";

const SETTINGS: AppSettings = {
  recentVaults: [{ path: "C:/vaults/mine.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
  theme: "light",
  groupDeleteMode: "keepContents",
};

function fakeDialog(overrides: Partial<SettingsFileDialog> = {}): SettingsFileDialog {
  return {
    pickPathForExport: vi.fn().mockResolvedValue(undefined),
    pickFileToImport: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeFileStorage(overrides: Partial<FileStorage> = {}): FileStorage {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn(),
    lastModified: vi.fn(),
    size: vi.fn(),
    copyFile: vi.fn(),
    removeFile: vi.fn(),
    grantAccess: vi.fn(),
    ...overrides,
  } as unknown as FileStorage;
}

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function writtenText(fileStorage: FileStorage): string {
  const [, data] = vi.mocked(fileStorage.writeFile).mock.calls[0];
  return new TextDecoder().decode(data);
}

describe("SettingsTransferService", () => {
  describe("exportSettings", () => {
    it("writes the shareable settings to the picked path", async () => {
      const dialog = fakeDialog({
        pickPathForExport: vi.fn().mockResolvedValue("C:/share/argus-settings.json"),
      });
      const fileStorage = fakeFileStorage();
      const service = new SettingsTransferService(dialog, fileStorage);

      const result = await service.exportSettings(SETTINGS);

      expect(result).toBe("C:/share/argus-settings.json");
      expect(vi.mocked(fileStorage.writeFile).mock.calls[0][0]).toBe(
        "C:/share/argus-settings.json",
      );
      expect(writtenText(fileStorage)).toBe(
        serializePortableSettings(toPortableSettings(SETTINGS)),
      );
    });

    it("resolves undefined and writes nothing when the dialog is cancelled", async () => {
      const fileStorage = fakeFileStorage();
      const service = new SettingsTransferService(fakeDialog(), fileStorage);

      expect(await service.exportSettings(SETTINGS)).toBeUndefined();
      expect(fileStorage.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("importSettings", () => {
    it("returns the current settings with the file's applied", async () => {
      const text = serializePortableSettings(toPortableSettings(SETTINGS));
      const dialog = fakeDialog({
        pickFileToImport: vi.fn().mockResolvedValue("C:/share/from-a-friend.json"),
      });
      const fileStorage = fakeFileStorage({
        readFile: vi.fn().mockResolvedValue(bytesOf(text)),
      });
      const service = new SettingsTransferService(dialog, fileStorage);

      const imported = await service.importSettings(DEFAULT_SETTINGS);

      expect(imported?.filePath).toBe("C:/share/from-a-friend.json");
      expect(imported?.settings.theme).toBe("light");
      expect(imported?.settings.groupDeleteMode).toBe("keepContents");
      expect(fileStorage.readFile).toHaveBeenCalledWith("C:/share/from-a-friend.json");
    });

    it("keeps the importing machine's own recent vaults", async () => {
      const text = serializePortableSettings(toPortableSettings(SETTINGS));
      const dialog = fakeDialog({
        pickFileToImport: vi.fn().mockResolvedValue("C:/share/from-a-friend.json"),
      });
      const service = new SettingsTransferService(
        dialog,
        fakeFileStorage({ readFile: vi.fn().mockResolvedValue(bytesOf(text)) }),
      );

      const mine: AppSettings = {
        recentVaults: [{ path: "C:/vaults/ours.kdbx", lastOpenedAt: "2026-02-02T00:00:00.000Z" }],
      };

      expect((await service.importSettings(mine))?.settings.recentVaults).toEqual(
        mine.recentVaults,
      );
    });

    it("resolves undefined and reads nothing when the dialog is cancelled", async () => {
      const fileStorage = fakeFileStorage();
      const service = new SettingsTransferService(fakeDialog(), fileStorage);

      expect(await service.importSettings(DEFAULT_SETTINGS)).toBeUndefined();
      expect(fileStorage.readFile).not.toHaveBeenCalled();
    });

    it("rejects a file that isn't a settings file", async () => {
      const dialog = fakeDialog({
        pickFileToImport: vi.fn().mockResolvedValue("C:/share/holiday.json"),
      });
      const service = new SettingsTransferService(
        dialog,
        fakeFileStorage({ readFile: vi.fn().mockResolvedValue(bytesOf('{"hello":"world"}')) }),
      );

      await expect(service.importSettings(DEFAULT_SETTINGS)).rejects.toThrow(SettingsImportError);
    });
  });
});
