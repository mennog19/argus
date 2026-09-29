import { Consts, Kdbx, KdbxEntry } from "kdbxweb";

const encoder = new TextEncoder();

/**
 * Approximate size of one history revision: field keys and values, tags, and
 * attachment bytes. Mirrors KeePass's own estimate rather than the serialized
 * size. Attachments are counted per revision even when shared by hash, as
 * KeePass does, since they are what actually makes history expensive.
 */
function revisionSize(revision: KdbxEntry): number {
  let size = 0;
  for (const [key, value] of revision.fields) {
    size += encoder.encode(key).length;
    size += typeof value === "string" ? encoder.encode(value).length : value.byteLength;
  }
  for (const tag of revision.tags) {
    size += encoder.encode(tag).length;
  }
  for (const binary of revision.binaries.values()) {
    size += ("hash" in binary ? binary.value : binary).byteLength;
  }
  return size;
}

/** A file that omits a limit gets KeePass's default; a negative one means unlimited. */
function resolveLimit(value: number | undefined, fallback: number): number {
  const limit = value ?? fallback;
  return limit < 0 ? Infinity : limit;
}

/**
 * Drops an entry's oldest history revisions until it fits the vault's
 * `HistoryMaxItems` and `HistoryMaxSize`, the way KeePass does after each
 * edit. Uses `removeHistory` rather than splicing so kdbxweb records a
 * tombstone for each removed revision and a later merge doesn't bring it back.
 */
export function trimHistory(entry: KdbxEntry, meta: Kdbx["meta"]): void {
  const maxItems = resolveLimit(meta.historyMaxItems, Consts.Defaults.HistoryMaxItems);
  while (entry.history.length > maxItems) {
    entry.removeHistory(0);
  }

  const maxSize = resolveLimit(meta.historyMaxSize, Consts.Defaults.HistoryMaxSize);
  let totalSize = entry.history.reduce((sum, revision) => sum + revisionSize(revision), 0);
  while (totalSize > maxSize) {
    totalSize -= revisionSize(entry.history[0]);
    entry.removeHistory(0);
  }
}
