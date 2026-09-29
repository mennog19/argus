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

    it("strips trailing dots and spaces, which Windows would drop silently", async () => {
      vi.mocked(save).mockResolvedValue(null);
      const dialog = new TauriVaultFileDialog();

      await dialog.pickPathForNewVault("Taxes. .");

      expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "Taxes.kdbx" }));
    });

    it("falls back to a default name when nothing usable is left", async () => {
      vi.mocked(save).mockResolvedValue(null);
      const dialog = new TauriVaultFileDialog();

      await dialog.pickPathForNewVault(" . ");

      expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "Vault.kdbx" }));
    });

    it("resolves undefined when the dialog is cancelled", async () => {
      vi.mocked(save).mockResolvedValue(null);
      const dialog = new TauriVaultFileDialog();

      expect(await dialog.pickPathForNewVault("Vault")).toBeUndefined();
    });
  });

  describe("pickPathForNewKeyFile", () => {
    it("resolves the chosen path, suggesting a .keyx named after the vault", async () => {
      vi.mocked(save).mockResolvedValue("C:/keys/Family.keyx");
      const dialog = new TauriVaultFileDialog();

      const result = await dialog.pickPathForNewKeyFile("Family: home\\work");

      expect(result).toBe("C:/keys/Family.keyx");
      expect(save).toHaveBeenCalledWith({
        filters: [{ name: "Key File", extensions: ["keyx"] }],
        defaultPath: "Family_ home_work.keyx",
      });
    });

    it("resolves undefined when the dialog is cancelled", async () => {
      vi.mocked(save).mockResolvedValue(null);
      const dialog = new TauriVaultFileDialog();

      expect(await dialog.pickPathForNewKeyFile("Vault")).toBeUndefined();
    });
  });

  describe("pickKeyFile", () => {
    it("resolves the chosen path, offering key-file extensions but allowing any file", async () => {
      vi.mocked(open).mockResolvedValue("C:/keys/mine.keyx");
      const dialog = new TauriVaultFileDialog();

      const result = await dialog.pickKeyFile();

      expect(result).toBe("C:/keys/mine.keyx");
      expect(open).toHaveBeenCalledWith({
        filters: [
          { name: "Key File", extensions: ["keyx", "key"] },
          { name: "All Files", extensions: ["*"] },
        ],
        multiple: false,
        directory: false,
      });
    });

    it("resolves undefined when the dialog is cancelled", async () => {
      vi.mocked(open).mockResolvedValue(null);
      const dialog = new TauriVaultFileDialog();

      expect(await dialog.pickKeyFile()).toBeUndefined();
    });
  });
});
