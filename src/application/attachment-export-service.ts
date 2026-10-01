import { Attachment } from "../domain";
import { AttachmentFileDialog } from "./attachment-file-dialog";
import { FileStorage } from "./file-storage";

/**
 * Saves a copy of an attachment to a file the user picks. Like the other
 * services here, returns `undefined` when the user cancels the file dialog so
 * callers can tell "cancelled" from "failed".
 *
 * The copy is written as it is, outside the vault's encryption; nothing here
 * tracks or cleans it up afterwards.
 */
export class AttachmentExportService {
  constructor(
    private readonly dialog: AttachmentFileDialog,
    private readonly fileStorage: FileStorage,
  ) {}

  async exportAttachment(attachment: Attachment): Promise<string | undefined> {
    const filePath = await this.dialog.pickPathForAttachment(attachment.name);
    if (!filePath) {
      return undefined;
    }
    await this.fileStorage.writeFile(filePath, attachment.data.slice().buffer);
    return filePath;
  }
}
