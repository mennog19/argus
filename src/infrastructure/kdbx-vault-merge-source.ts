import { FileStorage } from "../application/file-storage";
import { OpenedMergeSource, VaultMergeSource } from "../application/vault-merge-source";
import { VaultFileDialog } from "../application/vault-file-dialog";
import { KdbxVaultRepository } from "./kdbx-vault-repository";

/**
 * `VaultMergeSource` backed by a fresh `KdbxVaultRepository` per call, kept
 * separate from whatever repository instance is backing the currently-open
 * vault (see `VaultMergeSource`'s doc comment for why that separation
 * matters).
 */
export class KdbxVaultMergeSource implements VaultMergeSource {
  constructor(
    private readonly dialog: VaultFileDialog,
    private readonly fileStorage: FileStorage,
  ) {}

  async pickAndOpen(masterPassword: string): Promise<OpenedMergeSource | undefined> {
    const filePath = await this.dialog.pickVaultToOpen();
    if (!filePath) {
      return undefined;
    }
    const fileBytes = await this.fileStorage.readFile(filePath);
    const vault = await new KdbxVaultRepository().openVault(fileBytes, masterPassword);
    return { vault, filePath };
  }
}
