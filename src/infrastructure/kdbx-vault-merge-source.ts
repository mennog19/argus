import { Vault } from "../domain";
import { FileStorage } from "../application/file-storage";
import { VaultMergeSource } from "../application/vault-merge-source";
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

  pickFile(): Promise<string | undefined> {
    return this.dialog.pickVaultToOpen();
  }

  async openFile(filePath: string, masterPassword: string): Promise<Vault> {
    const fileBytes = await this.fileStorage.readFile(filePath);
    const session = await new KdbxVaultRepository().openVault(fileBytes, masterPassword);
    // The merge only reads the incoming vault, so its session is dropped here
    // rather than kept open — nothing is ever written back to that file.
    return session.vault;
  }
}
