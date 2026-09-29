import { open, save } from "@tauri-apps/plugin-dialog";
import { VaultFileDialog } from "../application/vault-file-dialog";

const KDBX_FILTERS = [{ name: "KeePass Vault", extensions: ["kdbx"] }];
// KeePassXC writes `.keyx` and KeePass `.key`, but any file at all can serve as
// a key file, so "All Files" has to stay reachable.
const KEY_FILE_FILTERS = [
  { name: "Key File", extensions: ["keyx", "key"] },
  { name: "All Files", extensions: ["*"] },
];

/** `<name>.kdbx`, with characters Windows forbids in file names replaced. */
function suggestedFileName(vaultName: string): string {
  // eslint-disable-next-line no-control-regex
  let safe = vaultName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
  // Windows silently strips trailing dots and spaces from file names.
  while (safe.endsWith(".") || safe.endsWith(" ")) {
    safe = safe.slice(0, -1);
  }
  return `${safe || "Vault"}.kdbx`;
}

/** `VaultFileDialog` backed by Tauri's native file-picker plugin. */
export class TauriVaultFileDialog implements VaultFileDialog {
  async pickVaultToOpen(): Promise<string | undefined> {
    const path = await open({ filters: KDBX_FILTERS, multiple: false, directory: false });
    return path ?? undefined;
  }

  async pickPathForNewVault(vaultName: string): Promise<string | undefined> {
    const path = await save({ filters: KDBX_FILTERS, defaultPath: suggestedFileName(vaultName) });
    return path ?? undefined;
  }

  async pickKeyFile(): Promise<string | undefined> {
    const path = await open({ filters: KEY_FILE_FILTERS, multiple: false, directory: false });
    return path ?? undefined;
  }
}
