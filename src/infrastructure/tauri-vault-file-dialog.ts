import { open, save } from "@tauri-apps/plugin-dialog";
import { VaultFileDialog } from "../application/vault-file-dialog";
import { safeFileName } from "./file-name";

const KDBX_FILTERS = [{ name: "KeePass Vault", extensions: ["kdbx"] }];
// KeePassXC writes `.keyx` and KeePass `.key`, but any file at all can serve as
// a key file, so "All Files" has to stay reachable.
const KEY_FILE_FILTERS = [
  { name: "Key File", extensions: ["keyx", "key"] },
  { name: "All Files", extensions: ["*"] },
];
const NEW_KEY_FILE_FILTERS = [{ name: "Key File", extensions: ["keyx"] }];

/** `<name>.<extension>`, with characters Windows forbids in file names replaced. */
function suggestedFileName(vaultName: string, extension: string): string {
  return `${safeFileName(vaultName, "Vault")}.${extension}`;
}

export class TauriVaultFileDialog implements VaultFileDialog {
  async pickVaultToOpen(): Promise<string | undefined> {
    const path = await open({ filters: KDBX_FILTERS, multiple: false, directory: false });
    return path ?? undefined;
  }

  async pickPathForNewVault(vaultName: string): Promise<string | undefined> {
    const path = await save({
      filters: KDBX_FILTERS,
      defaultPath: suggestedFileName(vaultName, "kdbx"),
    });
    return path ?? undefined;
  }

  async pickKeyFile(): Promise<string | undefined> {
    const path = await open({ filters: KEY_FILE_FILTERS, multiple: false, directory: false });
    return path ?? undefined;
  }

  async pickPathForNewKeyFile(vaultName: string): Promise<string | undefined> {
    const path = await save({
      filters: NEW_KEY_FILE_FILTERS,
      defaultPath: suggestedFileName(vaultName, "keyx"),
    });
    return path ?? undefined;
  }
}
