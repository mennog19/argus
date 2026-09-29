import {
  ByteUtils,
  Credentials,
  Int64,
  Kdbx,
  KdbxBinary,
  KdbxBinaryWithHash,
  KdbxCustomDataMap,
  KdbxEntry,
  KdbxGroup,
  KdbxTimes,
  KdbxUuid,
  ProtectedValue,
  VarDictionary,
} from "kdbxweb";
import { configureKdbxCrypto } from "../../src/infrastructure/kdbx-crypto";
// Inlined by Vite as base64 data URLs.
import kdbx3Aes from "../fixtures/keepass/kdbx3-aes.kdbx?inline";
import kdbx4Argon2id from "../fixtures/keepass/kdbx4-argon2id.kdbx?inline";
import keyFileVault from "../fixtures/keepass/keyfile.kdbx?inline";
import keyFile from "../fixtures/keepass/keyfile.keyx?inline";

/**
 * Vaults written by KeePass 2.x itself, via `scripts/generate-keepass-fixtures.ps1`.
 * Must match `$MasterPassword` in that script.
 */
export const KEEPASS_FIXTURE_PASSWORD = "Fixture-passw0rd!";

const FIXTURES = {
  "kdbx3-aes.kdbx": kdbx3Aes,
  "kdbx4-argon2id.kdbx": kdbx4Argon2id,
  "keyfile.kdbx": keyFileVault,
  "keyfile.keyx": keyFile,
};

export type KeePassFixture = keyof typeof FIXTURES;

/** A fresh `ArrayBuffer` of a fixture file, the way `FileStorage` hands files over. */
export function readKeePassFixture(name: KeePassFixture): ArrayBuffer {
  const base64 = FIXTURES[name].slice(FIXTURES[name].indexOf(",") + 1);
  return ByteUtils.base64ToBytes(base64).slice().buffer;
}

/**
 * Parses a file straight through kdbxweb, the way any other KeePass client
 * would. The decrypted XML is kept on `db.xml`, for checks on how the file
 * itself is written rather than on what kdbxweb makes of it.
 */
export async function loadRaw(bytes: ArrayBuffer, keyFile?: ArrayBuffer): Promise<Kdbx> {
  configureKdbxCrypto();
  return Kdbx.load(
    bytes,
    new Credentials(ProtectedValue.fromString(KEEPASS_FIXTURE_PASSWORD), keyFile),
    { preserveXml: true },
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Names of the XML elements whose text is an ISO date. KDBX4 stores every
 * date as base64 seconds, and KeePass 2 refuses to open a KDBX4 file with a
 * textual one, even though kdbxweb's own reader accepts either.
 */
export function textualDateElements(db: Kdbx): string[] {
  // xmldom, which kdbxweb parses with, has no `childElementCount`.
  const isLeaf = (node: Element) =>
    Array.from(node.childNodes).every((child) => child.nodeType !== child.ELEMENT_NODE);
  return Array.from(db.xml!.getElementsByTagName("*"))
    .filter((node) => isLeaf(node) && ISO_DATE.test(node.textContent ?? ""))
    .map((node) => `${node.parentNode?.nodeName}/${node.nodeName}`);
}

// The snapshots below turn a parsed KDBX document into plain JSON-able data
// covering every property kdbxweb reads, so two files can be compared with a
// single `toEqual` and a failure pinpoints the property that differs.

function uuid(value: KdbxUuid | undefined): string | undefined {
  return value?.id;
}

function time(value: Date | undefined): string | undefined {
  return value?.toISOString();
}

function customData(map: KdbxCustomDataMap | undefined) {
  if (!map) {
    return undefined;
  }
  return Object.fromEntries(
    [...map].map(([key, item]) => [
      key,
      { value: item.value, lastModified: time(item.lastModified) },
    ]),
  );
}

function times(value: KdbxTimes) {
  return {
    creationTime: time(value.creationTime),
    lastModTime: time(value.lastModTime),
    lastAccessTime: time(value.lastAccessTime),
    expiryTime: time(value.expiryTime),
    expires: value.expires,
    usageCount: value.usageCount,
    locationChanged: time(value.locationChanged),
  };
}

function binaryHex(binary: KdbxBinary | KdbxBinaryWithHash): string {
  const value = "hash" in binary ? binary.value : binary;
  const bytes = value instanceof ProtectedValue ? value.getBinary() : new Uint8Array(value);
  return ByteUtils.bytesToHex(bytes);
}

/** Every property of an entry, except its history, which `snapshotEntry` adds. */
export function snapshotRevision(entry: KdbxEntry) {
  return {
    uuid: uuid(entry.uuid),
    icon: entry.icon,
    customIcon: uuid(entry.customIcon),
    fgColor: entry.fgColor,
    bgColor: entry.bgColor,
    overrideUrl: entry.overrideUrl,
    tags: entry.tags,
    times: times(entry.times),
    fields: Object.fromEntries(
      [...entry.fields].map(([key, value]) => [
        key,
        value instanceof ProtectedValue
          ? { protected: true, text: value.getText() }
          : { protected: false, text: value },
      ]),
    ),
    binaries: Object.fromEntries(
      [...entry.binaries].map(([name, binary]) => [name, binaryHex(binary)]),
    ),
    autoType: entry.autoType,
    customData: customData(entry.customData),
    qualityCheck: entry.qualityCheck,
    previousParentGroup: uuid(entry.previousParentGroup),
  };
}

export function snapshotEntry(entry: KdbxEntry) {
  return { ...snapshotRevision(entry), history: entry.history.map(snapshotRevision) };
}

function snapshotGroup(group: KdbxGroup) {
  return {
    uuid: uuid(group.uuid),
    name: group.name,
    notes: group.notes,
    icon: group.icon,
    customIcon: uuid(group.customIcon),
    tags: group.tags,
    times: times(group.times),
    expanded: group.expanded,
    defaultAutoTypeSeq: group.defaultAutoTypeSeq,
    enableAutoType: group.enableAutoType,
    enableSearching: group.enableSearching,
    lastTopVisibleEntry: uuid(group.lastTopVisibleEntry),
    previousParentGroup: uuid(group.previousParentGroup),
    customData: customData(group.customData),
    groups: group.groups.map((child) => uuid(child.uuid)),
    entries: group.entries.map((entry) => uuid(entry.uuid)),
  };
}

function varDictionary(dictionary: VarDictionary | undefined, skip: readonly string[] = []) {
  if (!dictionary) {
    return undefined;
  }
  return Object.fromEntries(
    dictionary
      .keys()
      .filter((key) => !skip.includes(key))
      .map((key) => {
        const value = dictionary.get(key);
        if (value instanceof Int64) {
          return [key, value.value];
        }
        if (value instanceof ArrayBuffer) {
          return [key, ByteUtils.bytesToHex(value)];
        }
        return [key, value];
      }),
  );
}

function snapshotMeta(db: Kdbx) {
  const { meta } = db;
  return {
    name: meta.name,
    nameChanged: time(meta.nameChanged),
    desc: meta.desc,
    defaultUser: meta.defaultUser,
    mntncHistoryDays: meta.mntncHistoryDays,
    color: meta.color,
    keyChanged: time(meta.keyChanged),
    keyChangeRec: meta.keyChangeRec,
    keyChangeForce: meta.keyChangeForce,
    recycleBinEnabled: meta.recycleBinEnabled,
    recycleBinUuid: uuid(meta.recycleBinUuid),
    entryTemplatesGroup: uuid(meta.entryTemplatesGroup),
    historyMaxItems: meta.historyMaxItems,
    historyMaxSize: meta.historyMaxSize,
    lastSelectedGroup: uuid(meta.lastSelectedGroup),
    lastTopVisibleGroup: uuid(meta.lastTopVisibleGroup),
    memoryProtection: meta.memoryProtection,
    customData: customData(meta.customData),
    customIcons: Object.fromEntries(
      [...meta.customIcons].map(([id, icon]) => [
        id,
        {
          data: ByteUtils.bytesToHex(icon.data),
          name: icon.name,
          lastModified: time(icon.lastModified),
        },
      ]),
    ),
  };
}

/**
 * The header settings that describe the file's format and key derivation.
 * Seeds, IVs and the KDF salt are left out: every save draws fresh ones, as
 * KeePass's own saves do.
 */
function snapshotHeader(db: Kdbx) {
  const { header } = db;
  return {
    versionMajor: header.versionMajor,
    versionMinor: header.versionMinor,
    dataCipherUuid: uuid(header.dataCipherUuid),
    compression: header.compression,
    keyEncryptionRounds: header.keyEncryptionRounds,
    crsAlgorithm: header.crsAlgorithm,
    kdfParameters: varDictionary(header.kdfParameters, ["S"]),
    publicCustomData: varDictionary(header.publicCustomData),
  };
}

/** A whole document: header settings, meta, and every group and entry by UUID. */
export function snapshotVault(db: Kdbx) {
  const root = db.getDefaultGroup();
  return {
    header: snapshotHeader(db),
    meta: snapshotMeta(db),
    groups: Object.fromEntries([...root.allGroups()].map((g) => [uuid(g.uuid), snapshotGroup(g)])),
    entries: Object.fromEntries(
      [...root.allEntries()].map((e) => [uuid(e.uuid), snapshotEntry(e)]),
    ),
    deletedObjects: db.deletedObjects.map((d) => ({
      uuid: uuid(d.uuid),
      deletionTime: time(d.deletionTime),
    })),
  };
}

export function findEntry(db: Kdbx, title: string): KdbxEntry {
  const entry = [...db.getDefaultGroup().allEntries()].find(
    (candidate) => candidate.fields.get("Title") === title,
  );
  if (!entry) {
    throw new Error(`No entry titled "${title}"`);
  }
  return entry;
}
