import { Kdbx, KdbxEntry, KdbxGroup, ProtectedValue } from "kdbxweb";
import {
  CustomField,
  CustomFields,
  Entry,
  EntryId,
  Group,
  GroupId,
  Tag,
  Tags,
  Password,
  Vault,
} from "../domain";
import { trimHistory } from "./kdbx-history";
import { iconFromKdbx, writeIconToKdbx } from "./kdbx-icon";
import { domainIdToKdbxUuid, kdbxUuidToDomainId } from "./kdbx-id";

const STANDARD_FIELD_KEYS = new Set(["Title", "UserName", "Password", "URL", "Notes"]);

function fieldToString(value: string | ProtectedValue | undefined): string {
  if (value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.getText();
}

function entryFromKdbx(kdbxEntry: KdbxEntry): Entry {
  const customFields = Array.from(kdbxEntry.fields.entries())
    .filter(([key]) => !STANDARD_FIELD_KEYS.has(key))
    .map(
      ([key, value]) => new CustomField(key, fieldToString(value), value instanceof ProtectedValue),
    );

  const tags = kdbxEntry.tags.map((tag) => new Tag(tag));

  return new Entry(EntryId.fromString(kdbxUuidToDomainId(kdbxEntry.uuid)), {
    times: {
      createdAt: kdbxEntry.times.creationTime,
      modifiedAt: kdbxEntry.times.lastModTime,
      accessedAt: kdbxEntry.times.lastAccessTime,
    },
    title: fieldToString(kdbxEntry.fields.get("Title")),
    username: fieldToString(kdbxEntry.fields.get("UserName")),
    password: new Password(fieldToString(kdbxEntry.fields.get("Password"))),
    url: fieldToString(kdbxEntry.fields.get("URL")),
    notes: fieldToString(kdbxEntry.fields.get("Notes")),
    tags: new Tags(tags),
    customFields: new CustomFields(customFields),
    icon: iconFromKdbx(kdbxEntry),
  });
}

function groupFromKdbx(kdbxGroup: KdbxGroup): Group {
  return new Group(
    GroupId.fromString(kdbxUuidToDomainId(kdbxGroup.uuid)),
    kdbxGroup.name ?? "",
    kdbxGroup.groups.map(groupFromKdbx),
    kdbxGroup.entries.map(entryFromKdbx),
    iconFromKdbx(kdbxGroup),
  );
}

function recycleBinIdFromKdbx(db: Kdbx): GroupId | undefined {
  if (
    !db.meta.recycleBinEnabled ||
    !db.meta.recycleBinUuid ||
    !db.getGroup(db.meta.recycleBinUuid)
  ) {
    return undefined;
  }
  return GroupId.fromString(kdbxUuidToDomainId(db.meta.recycleBinUuid));
}

export function vaultFromKdbx(db: Kdbx): Vault {
  return new Vault(
    db.meta.name ?? "",
    groupFromKdbx(db.getDefaultGroup()),
    recycleBinIdFromKdbx(db),
  );
}

/**
 * Canonical, order-independent snapshot of the value an `Entry` carries, used
 * to detect real changes. `times` is deliberately absent: timestamps are
 * metadata about the entry, not part of it, so recording that an entry was
 * opened must not look like an edit and must not push a history revision.
 */
function snapshotEntry(entry: Entry): string {
  return JSON.stringify({
    title: entry.title,
    username: entry.username,
    password: entry.password.reveal(),
    url: entry.url,
    notes: entry.notes,
    tags: entry.tags.values.map((tag) => tag.toString()).sort(),
    customFields: entry.customFields.values
      .map((field) => ({ key: field.key, value: field.value, isProtected: field.isProtected }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    icon: entry.icon.toString(),
  });
}

function writeEntryFields(
  kdbxEntry: KdbxEntry,
  entry: Entry,
  protection: Kdbx["meta"]["memoryProtection"],
): void {
  kdbxEntry.fields.set(
    "Title",
    protection.title ? ProtectedValue.fromString(entry.title) : entry.title,
  );
  kdbxEntry.fields.set(
    "UserName",
    protection.userName ? ProtectedValue.fromString(entry.username) : entry.username,
  );
  kdbxEntry.fields.set("Password", ProtectedValue.fromString(entry.password.reveal()));
  kdbxEntry.fields.set("URL", protection.url ? ProtectedValue.fromString(entry.url) : entry.url);
  kdbxEntry.fields.set(
    "Notes",
    protection.notes ? ProtectedValue.fromString(entry.notes) : entry.notes,
  );
  kdbxEntry.tags = entry.tags.values.map((tag) => tag.toString());

  const keepKeys = new Set(entry.customFields.values.map((field) => field.key));
  for (const key of Array.from(kdbxEntry.fields.keys())) {
    if (!STANDARD_FIELD_KEYS.has(key) && !keepKeys.has(key)) {
      kdbxEntry.fields.delete(key);
    }
  }
  for (const field of entry.customFields.values) {
    kdbxEntry.fields.set(
      field.key,
      field.isProtected ? ProtectedValue.fromString(field.value) : field.value,
    );
  }

  // Only touched when the choice actually changed, so an icon Argus can't
  // represent (a custom image, an unmapped KeePass icon) survives other edits.
  if (!iconFromKdbx(kdbxEntry).equals(entry.icon)) {
    writeIconToKdbx(kdbxEntry, entry.icon);
  }

  kdbxEntry.times.update();
}

/**
 * Carries an "entry was opened" stamp into the KDBX document. Applied after
 * `writeEntryFields` (whose `times.update()` would otherwise clobber it) and
 * only when it moves the timestamp forward, so a vault opened alongside
 * another KeePass client never has its access time rolled back.
 */
function writeAccessTime(kdbxEntry: KdbxEntry, entry: Entry): void {
  const accessedAt = entry.times.accessedAt;
  if (!accessedAt) {
    return;
  }
  const current = kdbxEntry.times.lastAccessTime;
  if (!current || accessedAt.getTime() > current.getTime()) {
    kdbxEntry.times.lastAccessTime = accessedAt;
  }
}

function syncEntry(
  entry: Entry,
  parentKdbxGroup: KdbxGroup,
  db: Kdbx,
  existingEntries: Map<string, KdbxEntry>,
  visitedEntries: Set<string>,
): void {
  const id = entry.id.toString();
  visitedEntries.add(id);

  const existing = existingEntries.get(id);
  if (!existing) {
    const kdbxEntry = db.createEntry(parentKdbxGroup);
    kdbxEntry.uuid = domainIdToKdbxUuid(id);
    writeEntryFields(kdbxEntry, entry, db.meta.memoryProtection);
    writeAccessTime(kdbxEntry, entry);
    return;
  }

  if (existing.parentGroup !== parentKdbxGroup) {
    db.move(existing, parentKdbxGroup);
  }
  if (snapshotEntry(entry) !== snapshotEntry(entryFromKdbx(existing))) {
    existing.pushHistory();
    writeEntryFields(existing, entry, db.meta.memoryProtection);
    trimHistory(existing, db.meta);
  }
  writeAccessTime(existing, entry);
}

function syncGroup(
  group: Group,
  kdbxGroup: KdbxGroup,
  db: Kdbx,
  existingGroups: Map<string, KdbxGroup>,
  existingEntries: Map<string, KdbxEntry>,
  visitedGroups: Set<string>,
  visitedEntries: Set<string>,
): void {
  visitedGroups.add(group.id.toString());
  let changed = false;
  if (kdbxGroup.name !== group.name) {
    kdbxGroup.name = group.name;
    changed = true;
  }
  if (!iconFromKdbx(kdbxGroup).equals(group.icon)) {
    writeIconToKdbx(kdbxGroup, group.icon);
    changed = true;
  }
  if (changed) {
    kdbxGroup.times.update();
  }

  for (const entry of group.entries) {
    syncEntry(entry, kdbxGroup, db, existingEntries, visitedEntries);
  }

  const childKdbxGroupsById = new Map<string, KdbxGroup>();
  for (const childGroup of group.groups) {
    const id = childGroup.id.toString();
    const existing = existingGroups.get(id);
    let childKdbxGroup: KdbxGroup;
    if (existing) {
      childKdbxGroup = existing;
      if (existing.parentGroup !== kdbxGroup) {
        db.move(existing, kdbxGroup);
      }
    } else {
      childKdbxGroup = db.createGroup(kdbxGroup, childGroup.name);
      childKdbxGroup.uuid = domainIdToKdbxUuid(id);
    }
    childKdbxGroupsById.set(id, childKdbxGroup);
    syncGroup(
      childGroup,
      childKdbxGroup,
      db,
      existingGroups,
      existingEntries,
      visitedGroups,
      visitedEntries,
    );
  }
  // The array order is what kdbxweb serializes and what KeePass/KeePassXC
  // display, so the domain's group order must be written back explicitly —
  // the loop above only appends new groups and relocates moved ones. Any
  // existing child no longer in the domain tree (deleted, or moved to a
  // different parent elsewhere in this same sync pass) is kept, appended
  // after the ordered ones, rather than dropped here: the deferred
  // deletion/move logic below and in later `syncGroup` calls still needs to
  // find it by walking this exact array.
  const domainChildIds = new Set(group.groups.map((childGroup) => childGroup.id.toString()));
  const keptExisting = kdbxGroup.groups.filter(
    (existingChild) => !domainChildIds.has(kdbxUuidToDomainId(existingChild.uuid)),
  );
  kdbxGroup.groups = [
    ...group.groups.map((childGroup) => childKdbxGroupsById.get(childGroup.id.toString())!),
    ...keptExisting,
  ];
}

/**
 * Applies a domain `Vault`'s tree onto the live `Kdbx` document it was
 * loaded from, mutating existing groups/entries in place (matched by id) and
 * only touching entries whose mapped value actually changed. This is what
 * keeps attachments, custom icons, entry history, and any other field the
 * domain model doesn't expose byte-for-byte intact for everything the user
 * didn't edit, instead of rebuilding the document from the (lossy) domain
 * model alone.
 */
export function applyVaultToKdbx(db: Kdbx, vault: Vault): void {
  db.meta.name = vault.name;

  const rootKdbxGroup = db.getDefaultGroup();

  const existingGroups = new Map<string, KdbxGroup>();
  const existingEntries = new Map<string, KdbxEntry>();
  for (const g of rootKdbxGroup.allGroups()) {
    existingGroups.set(kdbxUuidToDomainId(g.uuid), g);
  }
  for (const e of rootKdbxGroup.allEntries()) {
    existingEntries.set(kdbxUuidToDomainId(e.uuid), e);
  }

  const visitedGroups = new Set<string>();
  const visitedEntries = new Set<string>();

  syncGroup(
    vault.rootGroup,
    rootKdbxGroup,
    db,
    existingGroups,
    existingEntries,
    visitedGroups,
    visitedEntries,
  );

  if (vault.recycleBinId) {
    db.meta.recycleBinEnabled = true;
    db.meta.recycleBinUuid = domainIdToKdbxUuid(vault.recycleBinId.toString());
  }

  const isUnvisitedGroup = (g: KdbxGroup) => !visitedGroups.has(kdbxUuidToDomainId(g.uuid));

  const recycleBinId = vault.recycleBinId?.toString();
  const isInRecycleBin = (item: KdbxGroup | KdbxEntry): boolean => {
    for (let g = item.parentGroup; g; g = g.parentGroup) {
      if (kdbxUuidToDomainId(g.uuid) === recycleBinId) {
        return true;
      }
    }
    return false;
  };

  // db.remove() moves an item into the recycle bin, which is a no-op (or a
  // flattening move) for something already inside it — so emptying the bin
  // would leave everything in the saved file. Items already in the bin are
  // detached with no destination instead, which kdbxweb records as a
  // deleted object so KeePass-style sync doesn't resurrect them.
  const discard = (item: KdbxGroup | KdbxEntry) => {
    if (isInRecycleBin(item)) {
      db.move(item, undefined);
    } else {
      db.remove(item);
    }
  };

  // Only the root group can lack a parentGroup, and the root is always
  // visited (it's synced unconditionally above), so anything reaching these
  // checks structurally has one — asserted rather than branched on, since a
  // defensive check here would be for a case the tree shape can't produce.
  for (const [id, group] of existingGroups) {
    if (visitedGroups.has(id)) {
      continue;
    }
    if (isUnvisitedGroup(group.parentGroup!)) {
      continue;
    }
    discard(group);
  }
  for (const [id, entry] of existingEntries) {
    if (visitedEntries.has(id)) {
      continue;
    }
    if (isUnvisitedGroup(entry.parentGroup!)) {
      continue;
    }
    discard(entry);
  }
}
