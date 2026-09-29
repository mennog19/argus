import { describe, expect, it, vi } from "vitest";
import { open, save } from "@tauri-apps/plugin-dialog";
import { TauriVaultFileDialog } from "../../src/infrastructure/tauri-vault-file-dialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

describe("TauriVaultFileDialog", () => {
  describe("pickVaultToOpen", () => {
    it("resolves the chosen path", async () => {
      vi.mocked(open).mockResolvedValue("C:/vaults/mine.kdbx");
      const dialog = new TauriVaultFileDialog();

      const result = await dialog.pickVaultToOpen();

      expect(result).toBe("C:/vaults/mine.kdbx");
      expect(open).toHaveBeenCalledWith({
        filters: [{ name: "KeePass Vault", extensions: ["kdbx"] }],
        multiple: false,
        directory: false,
      });
    });

    it("resolves undefined when the dialog is cancelled", async () => {
      vi.mocked(open).mockResolvedValue(null);
      const dialog = new TauriVaultFileDialog();

      expect(await dialog.pickVaultToOpen()).toBeUndefined();
    });
  });

  describe("pickPathForNewVault", () => {
    it("resolves the chosen path", async () => {
      vi.mocked(save).mockResolvedValue("C:/vaults/new.kdbx");
      const dialog = new TauriVaultFileDialog();

      const result = await dialog.pickPathForNewVault("Family");

      expect(result).toBe("C:/vaults/new.kdbx");
      expect(save).toHaveBeenCalledWith({
        filters: [{ name: "KeePass Vault", extensions: ["kdbx"] }],
        defaultPath: "Family.kdbx",
      });
    });

    it("replaces characters that are invalid in file names", async () => {
      vi.mocked(save).mockResolvedValue(null);
      const dialog = new TauriVaultFileDialog();

      await dialog.pickPathForNewVault('Work: "a/b"');

      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: "Work_ _a_b_.kdbx" }),
      );
    });

    it("resolves undefined when the dialog is cancelled", async () => {
      vi.mocked(save).mockResolvedValue(null);
      const dialog = new TauriVaultFileDialog();

      expect(await dialog.pickPathForNewVault("Vault")).toBeUndefined();
    });
  });
});
