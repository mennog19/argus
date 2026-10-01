import {
  ByteUtils,
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
import {
  DEFAULT_KDF,
  VaultKdf,
  VaultSettings,
  vaultSettingsError,
} from "../application/vault-settings";
import { Vault } from "../domain";
import { checkAesKdfLimit } from "./kdbx-aes-kdf";
import { KdbxAttachmentStore } from "./kdbx-attachments";
import { configureKdbxCrypto } from "./kdbx-crypto";
import { resolveLimit } from "./kdbx-history";
import { applyVaultToKdbx, vaultFromKdbx } from "./kdbx-mapper";

// Re-exported for the callers that knew it from here before it moved.
export { DEFAULT_KDF };

// Both inputs are always 32-byte SHA-256 digests here, so a length check
// would be dead code — a mismatched byte still fails the comparison.
function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.every((byte, index) => byte === b[index]);
}

const KDF_IDS = {
  argon2id: Consts.KdfId.Argon2id,
  argon2d: Consts.KdfId.Argon2d,
  aes: Consts.KdfId.Aes,
} as const;

/** The KDF settings a document will be saved with. */
function kdfFromKdbx(db: Kdbx): VaultKdf {
  const params = db.header.kdfParameters;
  if (!params) {
    // KDBX 3, which has only AES-KDF. A header without its round count
    // doesn't load.
    return { kind: "aes", rounds: db.header.keyEncryptionRounds! };
  }
  const id = ByteUtils.bytesToBase64(params.get("$UUID") as ArrayBuffer);
  if (id === KDF_IDS.aes) {
    return { kind: "aes", rounds: (params.get("R") as Int64).value };
  }
  return {
    kind: id === KDF_IDS.argon2id ? "argon2id" : "argon2d",
    memoryBytes: (params.get("M") as Int64).value,
    iterations: (params.get("I") as Int64).value,
    parallelism: params.get("P") as number,
  };
}

function applyKdf(db: Kdbx, kdf: VaultKdf): void {
  if (db.versionMajor < 4) {
    if (kdf.kind !== "aes") {
      throw new Error("A KDBX 3 vault can only use AES-KDF. Upgrade it to KDBX 4 to use Argon2.");
    }
    db.header.keyEncryptionRounds = kdf.rounds;
    return;
  }
  if (kdf.kind !== kdfFromKdbx(db).kind) {
    // Starts the new KDF's parameter dictionary off with kdbxweb's defaults.
    db.setKdf(KDF_IDS[kdf.kind]);
  }
  // `setKdf`, like loading a KDBX 4 file, always leaves the dictionary set.
  const params = db.header.kdfParameters!;
  if (kdf.kind === "aes") {
    params.set("R", VarDictionary.ValueType.UInt64, new Int64(kdf.rounds));
    return;
  }
  params.set("M", VarDictionary.ValueType.UInt64, new Int64(kdf.memoryBytes));
  params.set("I", VarDictionary.ValueType.UInt64, new Int64(kdf.iterations));
  params.set("P", VarDictionary.ValueType.UInt32, kdf.parallelism);
}

/** A limit as KDBX stores it, where a negative number means unlimited. */
function limitToKdbx(limit: number | undefined): number {
  return limit ?? -1;
}

function limitFromKdbx(value: number | undefined, fallback: number): number | undefined {
  const limit = resolveLimit(value, fallback);
  return limit === Infinity ? undefined : limit;
}

function applyDefaultKdf(db: Kdbx): void {
  applyKdf(db, { kind: "argon2id", ...DEFAULT_KDF });
}

const UNREADABLE_KEY_FILE = "That key file couldn't be read. Is it the right file?";

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
    throw new Error(UNREADABLE_KEY_FILE, { cause });
  }
}

async function loadKdbx(fileBytes: ArrayBuffer, key: VaultKey): Promise<Kdbx> {
  configureKdbxCrypto();
  // Before anything else: kdbxweb starts the key transform as soon as it has
  // the header, and offers no way to stop it.
  checkAesKdfLimit(fileBytes);
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
    this.db.meta.keyChanged = new Date();
  }

  async changeKeyFile(
    currentMasterPassword: string,
    keyFile: ArrayBuffer | undefined,
  ): Promise<void> {
    if (!(await this.matchesCurrentPassword(currentMasterPassword))) {
      throw new IncorrectMasterPasswordError();
    }
    if (!keyFile && !this.db.credentials.passwordHash) {
      throw new Error(
        "This vault has no master password, so its key file is all that locks it. " +
          "Set a master password before removing the key file.",
      );
    }
    try {
      await this.db.credentials.setKeyFile(keyFile);
    } catch (cause) {
      throw new Error(UNREADABLE_KEY_FILE, { cause });
    }
    this.db.meta.keyChanged = new Date();
  }

  get settings(): VaultSettings {
    const { meta } = this.db;
    return {
      historyMaxItems: limitFromKdbx(meta.historyMaxItems, Consts.Defaults.HistoryMaxItems),
      historyMaxSizeBytes: limitFromKdbx(meta.historyMaxSize, Consts.Defaults.HistoryMaxSize),
      kdf: kdfFromKdbx(this.db),
    };
  }

  applySettings(settings: VaultSettings): void {
    const problem = vaultSettingsError(settings);
    if (problem) {
      throw new Error(problem);
    }
    applyKdf(this.db, settings.kdf);
    this.db.meta.historyMaxItems = limitToKdbx(settings.historyMaxItems);
    this.db.meta.historyMaxSize = limitToKdbx(settings.historyMaxSizeBytes);
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
    newKey: VaultKey,
  ): Promise<ArrayBuffer> {
    const db = await loadKdbx(fileBytes, currentKey);
    db.credentials = await credentialsFor(newKey);
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
