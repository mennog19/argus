import { describe, expect, it, vi } from "vitest";
import { save } from "@tauri-apps/plugin-dialog";
import { TauriAttachmentFileDialog } from "../../src/infrastructure/tauri-attachment-file-dialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

describe("TauriAttachmentFileDialog", () => {
  it("resolves the chosen path, suggesting the attachment's name", async () => {
    vi.mocked(save).mockResolvedValue("C:/out/notes.txt");
    const dialog = new TauriAttachmentFileDialog();

    const result = await dialog.pickPathForAttachment("notes.txt");

    expect(result).toBe("C:/out/notes.txt");
    expect(save).toHaveBeenCalledWith({ defaultPath: "notes.txt" });
  });

  it("keeps a name read from the vault from pointing the dialog at another folder", async () => {
    vi.mocked(save).mockResolvedValue(null);
    const dialog = new TauriAttachmentFileDialog();

    await dialog.pickPathForAttachment("..\\..\\Startup\\run.bat");

    expect(save).toHaveBeenLastCalledWith({ defaultPath: ".._.._Startup_run.bat" });
  });

  it("falls back to a generic name when nothing usable is left", async () => {
    vi.mocked(save).mockResolvedValue(null);
    const dialog = new TauriAttachmentFileDialog();

    await dialog.pickPathForAttachment(" . ");

    expect(save).toHaveBeenLastCalledWith({ defaultPath: "attachment" });
  });

  it("resolves undefined when the dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    const dialog = new TauriAttachmentFileDialog();

    expect(await dialog.pickPathForAttachment("notes.txt")).toBeUndefined();
  });
});
