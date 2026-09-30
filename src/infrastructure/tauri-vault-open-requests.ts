import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { VaultOpenRequests } from "../application/vault-open-requests";
import { unsubscribeOnceRegistered } from "./tauri-listener";

/** Emitted by the Rust side (`open_vault.rs`) when a second launch asks to open a vault. */
const OPEN_VAULT_EVENT = "open-vault";

/**
 * `VaultOpenRequests` backed by the Rust side, which reads the vault path from
 * the launch arguments and has already allowed it in the filesystem scope.
 */
export class TauriVaultOpenRequests implements VaultOpenRequests {
  onOpenRequest(callback: (filePath: string) => void): () => void {
    let cancelled = false;
    void invoke<string | null>("launch_vault_path").then((filePath) => {
      if (filePath !== null && !cancelled) {
        callback(filePath);
      }
    });
    const unsubscribe = unsubscribeOnceRegistered(
      listen<string>(OPEN_VAULT_EVENT, (event) => callback(event.payload)),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }
}
