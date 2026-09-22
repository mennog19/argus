import { Entry } from "./entry";
import { Group } from "./group";
import { Vault } from "./vault";

export type MergeFieldKey =
  "title" | "username" | "password" | "url" | "notes" | "tags" | "customFields";

export interface FieldDifference {
  readonly field: MergeFieldKey;
  readonly targetValue: string;
  readonly sourceValue: string;
}

export interface MatchedEntryPair {
  readonly targetEntry: Entry;
  readonly sourceEntry: Entry;
  readonly differences: readonly FieldDifference[];
}

/**
 * The result of comparing a target vault against a source vault to merge in:
 * every source entry (outside its own recycle bin) ends up in exactly one of
 * these buckets. `identical` pairs have no field differences at all;
 * `conflicts` pairs matched but differ in at least one field.
 */
export interface VaultMergePlan {
  readonly newEntries: readonly Entry[];
  readonly conflicts: readonly MatchedEntryPair[];
  readonly identical: readonly MatchedEntryPair[];
}

const DIFFED_FIELDS: readonly MergeFieldKey[] = [
  "title",
  "username",
  "password",
  "url",
  "notes",
  "tags",
  "customFields",
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function fieldValue(entry: Entry, field: MergeFieldKey): string {
  switch (field) {
    case "title":
      return entry.title;
    case "username":
      return entry.username;
    case "password":
      return entry.password.reveal();
    case "url":
      return entry.url;
    case "notes":
      return entry.notes;
    case "tags":
      return entry.tags.values
        .map((tag) => tag.toString())
        .sort()
        .join(", ");
    case "customFields":
      return entry.customFields.values
        .map((field) => `${field.key}=${field.value}`)
        .sort()
        .join("; ");
  }
}

function diffEntries(target: Entry, source: Entry): FieldDifference[] {
  const differences: FieldDifference[] = [];
  for (const field of DIFFED_FIELDS) {
    const targetValue = fieldValue(target, field);
    const sourceValue = fieldValue(source, field);
    if (targetValue !== sourceValue) {
      differences.push({ field, targetValue, sourceValue });
    }
  }
  return differences;
}

function collectMergeableEntries(vault: Vault): Entry[] {
  const entries: Entry[] = [];
  function visit(group: Group) {
    if (vault.isInRecycleBin(group.id)) {
      return;
    }
    entries.push(...group.entries);
    for (const child of group.groups) {
      visit(child);
    }
  }
  visit(vault.rootGroup);
  return entries;
}

/**
 * Two entries are considered "the same" for merge purposes when their
 * usernames match and either their titles or their URLs also match
 * (case-insensitively, ignoring surrounding whitespace). There's no shared
 * identity across two independently-created KDBX files to key off instead,
 * and a blank field never counts as a match on its own.
 */
function entriesMatch(a: Entry, b: Entry): boolean {
  const username = normalize(a.username);
  if (username === "" || username !== normalize(b.username)) {
    return false;
  }
  const title = normalize(a.title);
  if (title !== "" && title === normalize(b.title)) {
    return true;
  }
  const url = normalize(a.url);
  return url !== "" && url === normalize(b.url);
}

/**
 * Compares `source` against `target` for a merge: every source entry is
 * greedily matched (in source order) against the first not-yet-matched
 * target entry `entriesMatch` accepts, so each target entry is claimed by at
 * most one source entry. Unmatched source entries are `newEntries`; matched
 * pairs land in `identical` or `conflicts` depending on whether their fields
 * differ.
 */
export function diffVaults(target: Vault, source: Vault): VaultMergePlan {
  const targetEntries = collectMergeableEntries(target);
  const sourceEntries = collectMergeableEntries(source);
  const consumedTargetIds = new Set<string>();

  const newEntries: Entry[] = [];
  const conflicts: MatchedEntryPair[] = [];
  const identical: MatchedEntryPair[] = [];

  for (const sourceEntry of sourceEntries) {
    const match = targetEntries.find(
      (candidate) =>
        !consumedTargetIds.has(candidate.id.toString()) && entriesMatch(candidate, sourceEntry),
    );
    if (!match) {
      newEntries.push(sourceEntry);
      continue;
    }
    consumedTargetIds.add(match.id.toString());
    const differences = diffEntries(match, sourceEntry);
    const pair: MatchedEntryPair = { targetEntry: match, sourceEntry, differences };
    if (differences.length === 0) {
      identical.push(pair);
    } else {
      conflicts.push(pair);
    }
  }

  return { newEntries, conflicts, identical };
}
