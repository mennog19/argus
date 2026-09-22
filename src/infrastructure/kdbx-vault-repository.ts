import { Credentials, Kdbx, ProtectedValue } from "kdbxweb";
import { IncorrectMasterPasswordError, VaultRepository } from "../application/vault-repository";
import { Vault } from "../domain";
import { configureKdbxCrypto } from "./kdbx-crypto";
import { applyVaultToKdbx, vaultFromKdbx } from "./kdbx-mapper";

// Both inputs are always 32-byte SHA-256 digests here, so a length check
// would be dead code — a mismatched byte still fails the comparison.
function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.every((byte, index) => byte === b[index]);
}

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

  async changeMasterPassword(
    currentMasterPassword: string,
    newMasterPassword: string,
  ): Promise<void> {
    if (!this.db) {
      throw new Error("No vault is open; call openVault before changeMasterPassword");
    }
    if (!(await this.matchesCurrentPassword(currentMasterPassword))) {
      throw new IncorrectMasterPasswordError();
    }
    await this.db.credentials.setPassword(ProtectedValue.fromString(newMasterPassword));
  }

  private async matchesCurrentPassword(candidate: string): Promise<boolean> {
    // `credentials.passwordHash` already *is* sha256(currentPassword) (see
    // `KdbxCredentials.setPassword`), not a value to hash again — comparing
    // it against a fresh `.getHash()` would compare a single hash against a
    // double hash and never match. It's always set: `openVault`/`createVault`
    // always construct `Credentials` with a non-null password.
    const stored = this.db!.credentials.passwordHash!;
    const candidateHash = await ProtectedValue.fromString(candidate).getHash();
    return buffersEqual(stored.getBinary(), new Uint8Array(candidateHash));
  }
}
