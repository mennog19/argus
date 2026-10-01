import { describe, expect, it, vi } from "vitest";
import { Attachment } from "../../src/domain";
import { AttachmentExportService } from "../../src/application/attachment-export-service";
import { AttachmentFileDialog } from "../../src/application/attachment-file-dialog";
import { FileStorage } from "../../src/application/file-storage";

function fakeFileStorage(): FileStorage {
  return { writeFile: vi.fn().mockResolvedValue(undefined) } as unknown as FileStorage;
}

function fakeDialog(path: string | undefined): AttachmentFileDialog {
  return { pickPathForAttachment: vi.fn().mockResolvedValue(path) };
}

describe("AttachmentExportService", () => {
  const attachment = new Attachment("notes.txt", new Uint8Array([1, 2, 3]));

  it("writes the attachment's bytes to the picked path", async () => {
    const dialog = fakeDialog("C:/out/notes.txt");
    const fileStorage = fakeFileStorage();
    const service = new AttachmentExportService(dialog, fileStorage);

    const result = await service.exportAttachment(attachment);

    expect(result).toBe("C:/out/notes.txt");
    expect(dialog.pickPathForAttachment).toHaveBeenCalledWith("notes.txt");
    const [path, data] = vi.mocked(fileStorage.writeFile).mock.calls[0];
    expect(path).toBe("C:/out/notes.txt");
    expect(new Uint8Array(data)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("writes only the attachment's own bytes when they are a view into a larger buffer", async () => {
    const fileStorage = fakeFileStorage();
    const service = new AttachmentExportService(fakeDialog("C:/out/part.bin"), fileStorage);
    const view = new Uint8Array(new Uint8Array([0, 1, 2, 3, 4]).buffer, 1, 2);

    await service.exportAttachment(new Attachment("part.bin", view));

    const [, data] = vi.mocked(fileStorage.writeFile).mock.calls[0];
    expect(new Uint8Array(data)).toEqual(new Uint8Array([1, 2]));
  });

  it("writes nothing when the dialog is cancelled", async () => {
    const fileStorage = fakeFileStorage();
    const service = new AttachmentExportService(fakeDialog(undefined), fileStorage);

    expect(await service.exportAttachment(attachment)).toBeUndefined();
    expect(fileStorage.writeFile).not.toHaveBeenCalled();
  });
});
