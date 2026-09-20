import { describe, expect, it, vi } from "vitest";
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { JsonSettingsStore } from "./json-settings-store";
import { AppSettings, DEFAULT_SETTINGS } from "../application/settings";

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: "AppData" },
  exists: vi.fn(),
  mkdir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

describe("JsonSettingsStore", () => {
  describe("load", () => {
    it("returns the default settings when the file doesn't exist yet", async () => {
      vi.mocked(exists).mockResolvedValue(false);
      const store = new JsonSettingsStore();

      const result = await store.load();

      expect(exists).toHaveBeenCalledWith("settings.json", { baseDir: BaseDirectory.AppData });
      expect(readTextFile).not.toHaveBeenCalled();
      expect(result).toEqual(DEFAULT_SETTINGS);
    });

    it("parses and returns the settings file's contents when it exists", async () => {
      const settings: AppSettings = {
        recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
      };
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(settings));
      const store = new JsonSettingsStore();

      const result = await store.load();

      expect(readTextFile).toHaveBeenCalledWith("settings.json", { baseDir: BaseDirectory.AppData });
      expect(result).toEqual(settings);
    });

    it("falls back to the default settings when the file is corrupted", async () => {
      vi.mocked(exists).mockResolvedValue(true);
      vi.mocked(readTextFile).mockResolvedValue("{ not valid json");
      const store = new JsonSettingsStore();

      const result = await store.load();

      expect(result).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("save", () => {
    it("ensures the app data directory exists and writes the settings as JSON", async () => {
      const settings: AppSettings = {
        recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
      };
      const store = new JsonSettingsStore();

      await store.save(settings);

      expect(mkdir).toHaveBeenCalledWith("", { baseDir: BaseDirectory.AppData, recursive: true });
      expect(writeTextFile).toHaveBeenCalledWith("settings.json", JSON.stringify(settings, null, 2), {
        baseDir: BaseDirectory.AppData,
      });
    });
  });
});
