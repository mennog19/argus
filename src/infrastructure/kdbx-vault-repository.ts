import { Credentials, Kdbx, ProtectedValue } from "kdbxweb";
import { VaultRepository } from "../application/vault-repository";
import { Vault } from "../domain";
import { configureKdbxCrypto } from "./kdbx-crypto";
import { applyVaultToKdbx, vaultFromKdbx } from "./kdbx-mapper";

/**
 * `kdbxweb`-backed `VaultRepository`. Keeps the parsed `Kdbx` document alive
 * across `openVault` -> `saveVault` so that fields the domain model doesn't
 * expose (attachments, custom icons, entry history, ...) round-trip
 * untouched instead of being dropped when the file is rebuilt from the
 * (intentionally lossy) domain model.
 */
export class KdbxVaultRepository implements VaultRepository {
  private db: Kdbx | undefined;

  async openVault(fileBytes: ArrayBuffer, masterPassword: string): Promise<Vault> {
    configureKdbxCrypto();
    const credentials = new Credentials(ProtectedValue.fromString(masterPassword));
    this.db = await Kdbx.load(fileBytes, credentials);
    return vaultFromKdbx(this.db);
  }

  async createVault(name: string, masterPassword: string): Promise<Vault> {
    configureKdbxCrypto();
    const credentials = new Credentials(ProtectedValue.fromString(masterPassword));
    this.db = Kdbx.create(credentials, name);
    return vaultFromKdbx(this.db);
  }

  async saveVault(vault: Vault): Promise<ArrayBuffer> {
    if (!this.db) {
      throw new Error("No vault is open; call openVault before saveVault");
    }
    applyVaultToKdbx(this.db, vault);
    return this.db.save();
  }
}
