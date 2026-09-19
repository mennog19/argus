import { open, save } from "@tauri-apps/plugin-dialog";
import { VaultFileDialog } from "../application/vault-file-dialog";

const KDBX_FILTERS = [{ name: "KeePass Vault", extensions: ["kdbx"] }];

/** `VaultFileDialog` backed by Tauri's native file-picker plugin. */
export class TauriVaultFileDialog implements VaultFileDialog {
  async pickVaultToOpen(): Promise<string | undefined> {
    const path = await open({ filters: KDBX_FILTERS, multiple: false, directory: false });
    return path ?? undefined;
  }

  async pickPathForNewVault(): Promise<string | undefined> {
    const path = await save({ filters: KDBX_FILTERS, defaultPath: "Vault.kdbx" });
    return path ?? undefined;
  }
}
