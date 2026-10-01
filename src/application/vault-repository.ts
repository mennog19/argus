import { Vault } from "../domain";
import { VaultSettings } from "./vault-settings";

/**
 * Thrown by `changeMasterPassword` when `currentMasterPassword` doesn't
 * match the currently open vault's credentials, so callers can show a
 * validation error instead of re-keying the vault.
 */
export class IncorrectMasterPasswordError extends Error {
  constructor() {
    super("Current password is incorrect.");
    this.name = "IncorrectMasterPasswordError";
  }
}

/**
 * What unlocks a vault: its master password, plus the contents of its key
 * file when it has one. KeePass and KeePassXC let a vault require either or
 * both; an empty `password` alongside a `keyFile` means a key-file-only vault.
 */
export interface VaultKey {
  readonly password: string;
  readonly keyFile?: ArrayBuffer;
}

/** A KDBX file format version, e.g. `{ major: 3, minor: 1 }` for KDBX 3.1. */
export interface VaultFormat {
  readonly major: number;
  readonly minor: number;
}

/**
 * One opened vault document, live for as long as it stays open.
 *
 * Saving and re-keying hang off the session rather than off the repository
 * so that "open it first" is a thing the types say, not a runtime check: you
 * cannot call `save` without already holding the result of an open.
 *
 * The session keeps the parsed document alive between `open` and `save`,
 * which is what lets fields the domain model doesn't expose (auto-type
 * settings, colours, custom data, ...) round-trip untouched instead of being
 * dropped when the file is rebuilt from the intentionally lossy domain model.
 */
export interface VaultSession {
  /**
   * The vault as the document holds it: as parsed when opened, then as of the
   * last `save`. That includes what a save adds by itself, such as the history
   * revision an edit pushes, so callers should carry on from this vault
   * rather than the one they saved.
   */
  readonly vault: Vault;
  /** The file format the document is in: as opened, or as of the last `upgradeFormat`. */
  readonly format: VaultFormat;
  /** Applies `vault`'s tree onto the open document and serializes it. */
  save(vault: Vault): Promise<ArrayBuffer>;
  /**
   * Re-keys the open document with a new master password, after verifying
   * `currentMasterPassword` against its existing credentials. Throws
   * `IncorrectMasterPasswordError` if it doesn't match. A key file the vault
   * was opened with stays part of its key. Doesn't persist anything by
   * itself; follow with `save`.
   */
  changeMasterPassword(currentMasterPassword: string, newMasterPassword: string): Promise<void>;
  /**
   * Replaces the key file half of the open document's key with `keyFile`, or
   * takes it away when `keyFile` is `undefined`, after verifying
   * `currentMasterPassword` the way `changeMasterPassword` does. The password
   * half stays as it is. Refuses to remove the key file of a vault that has
   * no master password, which would leave it with no key at all. Doesn't
   * persist anything by itself; follow with `save`.
   */
  changeKeyFile(currentMasterPassword: string, keyFile: ArrayBuffer | undefined): Promise<void>;
  /** The document's own settings: as opened, or as of the last `applySettings`. */
  readonly settings: VaultSettings;
  /**
   * Changes the document's history limits and key derivation. Throws, with a
   * message for the user, on settings `vaultSettingsError` rejects or a KDF
   * the document's format can't use. Doesn't persist anything by itself;
   * follow with `save`.
   */
  applySettings(settings: VaultSettings): void;
  /**
   * Converts a KDBX 3 document to KDBX 4, deriving its key with Argon2id from
   * then on. Does nothing to a document that is already KDBX 4. Like
   * `changeMasterPassword`, doesn't persist anything by itself; follow with
   * `save`.
   */
  upgradeFormat(): void;
}

/** Opens and creates KDBX vault documents. Holds no state of its own. */
export interface VaultRepository {
  openVault(fileBytes: ArrayBuffer, key: VaultKey): Promise<VaultSession>;
  createVault(name: string, key: VaultKey): Promise<VaultSession>;
  /**
   * The contents of a brand-new random key file, in the XML format KeePass
   * and KeePassXC write, so the vault it protects opens in either of them.
   */
  generateKeyFile(): Promise<ArrayBuffer>;
  /**
   * Re-encrypts a whole vault file under `newKey` without opening it as a
   * session or mapping it through the domain model, so everything but the
   * credentials comes back out unchanged. For re-keying the backups that sit
   * next to a vault whose password or key file just changed. Rejects if
   * `currentKey` doesn't open `fileBytes`.
   */
  rekeyFile(fileBytes: ArrayBuffer, currentKey: VaultKey, newKey: VaultKey): Promise<ArrayBuffer>;
}
