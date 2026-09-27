import { Credentials, Kdbx, ProtectedValue } from "kdbxweb";
import {
  IncorrectMasterPasswordError,
  VaultRepository,
  VaultSession,
} from "../application/vault-repository";
import { Vault } from "../domain";
import { configureKdbxCrypto } from "./kdbx-crypto";
import { applyVaultToKdbx, vaultFromKdbx } from "./kdbx-mapper";

// Both inputs are always 32-byte SHA-256 digests here, so a length check
// would be dead code — a mismatched byte still fails the comparison.
function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.every((byte, index) => byte === b[index]);
}

/** A `kdbxweb` document, held open so that unmapped fields survive a save. */
class KdbxVaultSession implements VaultSession {
  readonly vault: Vault;

  constructor(private readonly db: Kdbx) {
    this.vault = vaultFromKdbx(db);
  }

  save(vault: Vault): Promise<ArrayBuffer> {
    applyVaultToKdbx(this.db, vault);
    return this.db.save();
  }

  async changeMasterPassword(
    currentMasterPassword: string,
    newMasterPassword: string,
  ): Promise<void> {
    if (!(await this.matchesCurrentPassword(currentMasterPassword))) {
      throw new IncorrectMasterPasswordError();
    }
    await this.db.credentials.setPassword(ProtectedValue.fromString(newMasterPassword));
  }

  private async matchesCurrentPassword(candidate: string): Promise<boolean> {
    // `credentials.passwordHash` already *is* sha256(currentPassword) (see
    // `KdbxCredentials.setPassword`), not a value to hash again — comparing
    // it against a fresh `.getHash()` would compare a single hash against a
    // double hash and never match. It's always set: the repository only ever
    // builds `Credentials` with a non-null password.
    const stored = this.db.credentials.passwordHash!;
    const candidateHash = await ProtectedValue.fromString(candidate).getHash();
    return buffersEqual(stored.getBinary(), new Uint8Array(candidateHash));
  }
}

/** `kdbxweb`-backed `VaultRepository`. Stateless; each open yields a session. */
export class KdbxVaultRepository implements VaultRepository {
  async openVault(fileBytes: ArrayBuffer, masterPassword: string): Promise<VaultSession> {
    configureKdbxCrypto();
    const credentials = new Credentials(ProtectedValue.fromString(masterPassword));
    return new KdbxVaultSession(await Kdbx.load(fileBytes, credentials));
  }

  createVault(name: string, masterPassword: string): Promise<VaultSession> {
    configureKdbxCrypto();
    const credentials = new Credentials(ProtectedValue.fromString(masterPassword));
    return Promise.resolve(new KdbxVaultSession(Kdbx.create(credentials, name)));
  }
}
