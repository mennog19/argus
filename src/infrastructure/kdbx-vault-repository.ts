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
  VaultFormat,
  VaultKey,
  VaultRepository,
  VaultSession,
} from "../application/vault-repository";
import { Vault } from "../domain";
import { KdbxAttachmentStore } from "./kdbx-attachments";
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

/**
 * A key file with an empty password means a key-file-only vault, whose
 * composite key has no password part at all. That differs from a password
 * part holding the empty string, which hashes to something and so would never
 * open it.
 */
async function credentialsFor({ password, keyFile }: VaultKey): Promise<Credentials> {
  const passwordPart = keyFile && password === "" ? null : ProtectedValue.fromString(password);
  const credentials = new Credentials(passwordPart, keyFile);
  try {
    // Parsing the key file happens here, before any decryption is attempted.
    return await credentials.ready;
  } catch (cause) {
    throw new Error("That key file couldn't be read. Is it the right file?", { cause });
  }
}

async function loadKdbx(fileBytes: ArrayBuffer, key: VaultKey): Promise<Kdbx> {
  configureKdbxCrypto();
  const credentials = await credentialsFor(key);
  try {
    return await Kdbx.load(fileBytes, credentials);
  } catch (cause) {
    if (cause instanceof KdbxError && cause.code === Consts.ErrorCodes.InvalidKey) {
      // Without a key file, a vault that needs one fails exactly like a wrong
      // password does, so the message has to mention both possibilities.
      const message = key.keyFile
        ? "Incorrect password or key file."
        : "Incorrect password. If this vault uses a key file, choose it as well.";
      throw new Error(message, { cause });
    }
    throw cause;
  }
}

/** A `kdbxweb` document, held open so that unmapped fields survive a save. */
class KdbxVaultSession implements VaultSession {
  private readonly attachments = new KdbxAttachmentStore();
  private current: Vault;

  constructor(private readonly db: Kdbx) {
    this.current = vaultFromKdbx(db, this.attachments);
  }

  get vault(): Vault {
    return this.current;
  }

  get format(): VaultFormat {
    return { major: this.db.versionMajor, minor: this.db.versionMinor };
  }

  async save(vault: Vault): Promise<ArrayBuffer> {
    await this.attachments.prepare(this.db, vault);
    applyVaultToKdbx(this.db, vault, this.attachments);
    // kdbxweb writes every pooled binary, used or not. Without this a deleted
    // attachment, or those of a purged entry or history revision, would stay
    // in the file for good.
    this.db.cleanup({ binaries: true });
    const fileBytes = await this.db.save();
    // Re-read rather than keep `vault`: the save may have added a history
    // revision, trimmed old ones, or stamped times the domain never set.
    this.current = vaultFromKdbx(this.db, this.attachments);
    return fileBytes;
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

  upgradeFormat(): void {
    if (this.db.versionMajor >= 4) {
      return;
    }
    // KDBX 3 has only AES-KDF, so kdbxweb's upgrade has to pick a KDF, and
    // picks its own cheap Argon2d defaults. Replace them with the settings a
    // vault Argus creates gets, or the upgrade would weaken the file.
    this.db.upgrade();
    applyDefaultKdf(this.db);
  }

  private async matchesCurrentPassword(candidate: string): Promise<boolean> {
    // `credentials.passwordHash` already *is* sha256(currentPassword) (see
    // `KdbxCredentials.setPassword`), not a value to hash again — comparing
    // it against a fresh `.getHash()` would compare a single hash against a
    // double hash and never match. It's unset only for a key-file-only vault,
    // whose current password is the empty one it was unlocked with.
    const stored = this.db.credentials.passwordHash;
    if (!stored) {
      return candidate === "";
    }
    const candidateHash = await ProtectedValue.fromString(candidate).getHash();
    return buffersEqual(stored.getBinary(), new Uint8Array(candidateHash));
  }
}

/** `kdbxweb`-backed `VaultRepository`. Stateless; each open yields a session. */
export class KdbxVaultRepository implements VaultRepository {
  async openVault(fileBytes: ArrayBuffer, key: VaultKey): Promise<VaultSession> {
    return new KdbxVaultSession(await loadKdbx(fileBytes, key));
  }

  async rekeyFile(
    fileBytes: ArrayBuffer,
    currentKey: VaultKey,
    newMasterPassword: string,
  ): Promise<ArrayBuffer> {
    const db = await loadKdbx(fileBytes, currentKey);
    // Replaces only the password part; the key file hash stays in place.
    await db.credentials.setPassword(ProtectedValue.fromString(newMasterPassword));
    return db.save();
  }

  async createVault(name: string, key: VaultKey): Promise<VaultSession> {
    configureKdbxCrypto();
    const db = Kdbx.create(await credentialsFor(key), name);
    applyDefaultKdf(db);
    return new KdbxVaultSession(db);
  }

  async generateKeyFile(): Promise<ArrayBuffer> {
    configureKdbxCrypto();
    // Version 2 is the `<KeyFile><Meta><Version>2.0` XML format KeePassXC
    // writes by default, with a checksum that catches a damaged copy.
    const bytes = await Credentials.createRandomKeyFile(2);
    return bytes.slice().buffer;
  }
}
