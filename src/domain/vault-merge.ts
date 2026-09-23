import { Entry } from "./entry";
import { Group } from "./group";
import { totpConfigFromCustomFields } from "./totp";
import { Vault } from "./vault";

export type MergeFieldKey = "title" | "username" | "password" | "url" | "totp";

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

/**
 * The only fields a merge looks at. Notes, tags and non-TOTP custom fields are
 * deliberately excluded: they don't take part in matching, and a difference in
 * one of them doesn't make two otherwise-equal entries a conflict.
 */
export const MERGE_FIELDS: readonly MergeFieldKey[] = [
  "title",
  "username",
  "password",
  "url",
  "totp",
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The comparable value of `field`. TOTP is folded into a single canonical
 * string so two entries only count as sharing an authenticator when the whole
 * configuration matches, not just the secret.
 */
export function mergeFieldValue(entry: Entry, field: MergeFieldKey): string {
  switch (field) {
    case "title":
      return entry.title;
    case "username":
      return entry.username;
    case "password":
      return entry.password.reveal();
    case "url":
      return entry.url;
    case "totp": {
      const config = totpConfigFromCustomFields(entry.customFields);
      return config ? `${config.secret}:${config.algorithm}:${config.digits}:${config.period}` : "";
    }
  }
}

function diffEntries(target: Entry, source: Entry): FieldDifference[] {
  const differences: FieldDifference[] = [];
  for (const field of MERGE_FIELDS) {
    const targetValue = mergeFieldValue(target, field);
    const sourceValue = mergeFieldValue(source, field);
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

/** Whether both entries have the same non-blank value for `field`. */
function sharesField(a: Entry, b: Entry, field: MergeFieldKey): boolean {
  const value = normalize(mergeFieldValue(a, field));
  return value !== "" && value === normalize(mergeFieldValue(b, field));
}

/**
 * Whether two entries describe the same account, which takes agreement on two
 * separate questions:
 *
 * - *Which site?* — the title or the URL has to match. A blank field never
 *   counts, so two entries aren't related by both lacking a URL.
 * - *Which account on that site?* — the usernames have to match. Two blank
 *   usernames count as agreement here (a shared Wi-Fi password has no
 *   username), but a filled one never matches a blank one.
 *
 * Password and TOTP deliberately take no part. Sharing a password across two
 * sites means the password was reused — that's a job for the health screen,
 * not a reason to treat an Airbnb login and a Netflix login as the same entry.
 */
function entriesMatch(a: Entry, b: Entry): boolean {
  if (!sharesField(a, b, "title") && !sharesField(a, b, "url")) {
    return false;
  }
  return normalize(a.username) === normalize(b.username);
}

/**
 * How many of the merge fields two entries share, used only to pick the best
 * candidate among several that already matched.
 */
function matchScore(a: Entry, b: Entry): number {
  return MERGE_FIELDS.filter((field) => sharesField(a, b, field)).length;
}

/**
 * Compares `source` against `target` for a merge: each source entry (in source
 * order) claims the not-yet-claimed target entry `entriesMatch` accepts that it
 * shares the most fields with, so every target entry is matched at most once
 * and the closest pairing wins. Source entries that match nothing are
 * `newEntries`; matched pairs land in `identical` or `conflicts` depending on
 * whether any of `MERGE_FIELDS` differ.
 */
export function diffVaults(target: Vault, source: Vault): VaultMergePlan {
  const targetEntries = collectMergeableEntries(target);
  const sourceEntries = collectMergeableEntries(source);
  const consumedTargetIds = new Set<string>();

  const newEntries: Entry[] = [];
  const conflicts: MatchedEntryPair[] = [];
  const identical: MatchedEntryPair[] = [];

  for (const sourceEntry of sourceEntries) {
    let match: Entry | undefined;
    let bestScore = 0;
    for (const candidate of targetEntries) {
      if (consumedTargetIds.has(candidate.id.toString())) {
        continue;
      }
      if (!entriesMatch(candidate, sourceEntry)) {
        continue;
      }
      const score = matchScore(candidate, sourceEntry);
      if (score > bestScore) {
        match = candidate;
        bestScore = score;
      }
    }
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
