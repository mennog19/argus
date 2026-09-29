import {
  Consts,
  Credentials,
  Int64,
  Kdbx,
  KdbxError,
  ProtectedValue,
  VarDictionary,
} from "kdbxweb";
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

/**
 * Argon2id settings for vaults Argus creates.
 * kdbxweb's own defaults are Argon2d with 1 MiB / 2 iterations, far too cheap
 * to slow down an offline guessing attack. These cost ~0.5s in hash-wasm's
 * single-threaded WASM Argon2 — paid on every unlock and every save.
 */
export const DEFAULT_KDF = {
  memoryBytes: 64 * 1024 * 1024,
  iterations: 4,
  parallelism: 2,
} as const;

function applyDefaultKdf(db: Kdbx): void {
  db.setKdf(Consts.KdfId.Argon2id);
  // `setKdf` with an Argon2 id always populates the parameter dictionary.
  const params = db.header.kdfParameters!;
  params.set("M", VarDictionary.ValueType.UInt64, new Int64(DEFAULT_KDF.memoryBytes));
  params.set("I", VarDictionary.ValueType.UInt64, new Int64(DEFAULT_KDF.iterations));
  params.set("P", VarDictionary.ValueType.UInt32, DEFAULT_KDF.parallelism);
}

async function loadKdbx(fileBytes: ArrayBuffer, masterPassword: string): Promise<Kdbx> {
  configureKdbxCrypto();
  const credentials = new Credentials(ProtectedValue.fromString(masterPassword));
  try {
    return await Kdbx.load(fileBytes, credentials);
  } catch (cause) {
    if (cause instanceof KdbxError && cause.code === Consts.ErrorCodes.InvalidKey) {
      throw new Error("Incorrect password", { cause });
    }
    throw cause;
  }
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
    return new KdbxVaultSession(await loadKdbx(fileBytes, masterPassword));
  }

  async rekeyFile(
    fileBytes: ArrayBuffer,
    currentMasterPassword: string,
    newMasterPassword: string,
  ): Promise<ArrayBuffer> {
    const db = await loadKdbx(fileBytes, currentMasterPassword);
    await db.credentials.setPassword(ProtectedValue.fromString(newMasterPassword));
    return db.save();
  }

  createVault(name: string, masterPassword: string): Promise<VaultSession> {
    configureKdbxCrypto();
    const credentials = new Credentials(ProtectedValue.fromString(masterPassword));
    const db = Kdbx.create(credentials, name);
    applyDefaultKdf(db);
    return Promise.resolve(new KdbxVaultSession(db));
  }
}
