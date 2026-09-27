import { describe, expect, it, vi } from "vitest";
import { open, save } from "@tauri-apps/plugin-dialog";
import { TauriSettingsFileDialog } from "./tauri-settings-file-dialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

const FILTERS = [{ name: "Argus Settings", extensions: ["json"] }];

describe("TauriSettingsFileDialog", () => {
  describe("pickPathForExport", () => {
    it("resolves the chosen path", async () => {
      vi.mocked(save).mockResolvedValue("C:/share/argus-settings.json");
      const dialog = new TauriSettingsFileDialog();

      const result = await dialog.pickPathForExport();

      expect(result).toBe("C:/share/argus-settings.json");
      expect(save).toHaveBeenCalledWith({
        filters: FILTERS,
        defaultPath: "argus-settings.json",
      });
    });

    it("resolves undefined when the dialog is cancelled", async () => {
      vi.mocked(save).mockResolvedValue(null);
      const dialog = new TauriSettingsFileDialog();

      expect(await dialog.pickPathForExport()).toBeUndefined();
    });
  });

  describe("pickFileToImport", () => {
    it("resolves the chosen path", async () => {
      vi.mocked(open).mockResolvedValue("C:/share/from-a-friend.json");
      const dialog = new TauriSettingsFileDialog();

      const result = await dialog.pickFileToImport();

      expect(result).toBe("C:/share/from-a-friend.json");
      expect(open).toHaveBeenCalledWith({
        filters: FILTERS,
        multiple: false,
        directory: false,
      });
    });

    it("resolves undefined when the dialog is cancelled", async () => {
      vi.mocked(open).mockResolvedValue(null);
      const dialog = new TauriSettingsFileDialog();

      expect(await dialog.pickFileToImport()).toBeUndefined();
    });
  });
});
