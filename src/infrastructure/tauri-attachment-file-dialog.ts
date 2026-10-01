import { save } from "@tauri-apps/plugin-dialog";
import { AttachmentFileDialog } from "../application/attachment-file-dialog";
import { safeFileName } from "./file-name";

export class TauriAttachmentFileDialog implements AttachmentFileDialog {
  async pickPathForAttachment(name: string): Promise<string | undefined> {
    const path = await save({ defaultPath: safeFileName(name, "attachment") });
    return path ?? undefined;
  }
}
