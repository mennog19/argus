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

type MergeFieldValues = Readonly<Record<MergeFieldKey, string>>;

/**
 * One value per merge field. Written out field by field rather than built in
 * a loop so that adding a `MergeFieldKey` is a type error here instead of a
 * silently missing entry.
 */
function mapFields(project: (field: MergeFieldKey) => string): MergeFieldValues {
  return {
    title: project("title"),
    username: project("username"),
    password: project("password"),
    url: project("url"),
    totp: project("totp"),
  };
}

/**
 * An entry with its merge fields already extracted, both raw (for reporting
 * differences) and normalized (for matching).
 *
 * Matching is O(targets x sources), and deriving a field is not free — the
 * TOTP value parses the entry's custom fields — so every value is computed
 * once per entry here rather than once per comparison.
 */
interface ComparableEntry {
  readonly entry: Entry;
  readonly values: MergeFieldValues;
  readonly normalized: MergeFieldValues;
}

function toComparable(entry: Entry): ComparableEntry {
  const values = mapFields((field) => mergeFieldValue(entry, field));
  return { entry, values, normalized: mapFields((field) => normalize(values[field])) };
}

function diffEntries(target: ComparableEntry, source: ComparableEntry): FieldDifference[] {
  const differences: FieldDifference[] = [];
  for (const field of MERGE_FIELDS) {
    const targetValue = target.values[field];
    const sourceValue = source.values[field];
    if (targetValue !== sourceValue) {
      differences.push({ field, targetValue, sourceValue });
    }
  }
  return differences;
}

function collectMergeableEntries(vault: Vault): ComparableEntry[] {
  // Skipping the bin group itself skips everything under it, which is the
  // same set `isInRecycleBin` describes — but without re-walking the tree
  // from the root once per group to ask.
  const recycleBinId = vault.recycleBinId;
  const entries: ComparableEntry[] = [];
  function visit(group: Group) {
    if (recycleBinId?.equals(group.id)) {
      return;
    }
    for (const entry of group.entries) {
      entries.push(toComparable(entry));
    }
    for (const child of group.groups) {
      visit(child);
    }
  }
  visit(vault.rootGroup);
  return entries;
}

/** Whether both entries have the same non-blank value for `field`. */
function sharesField(a: ComparableEntry, b: ComparableEntry, field: MergeFieldKey): boolean {
  const value = a.normalized[field];
  return value !== "" && value === b.normalized[field];
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
function entriesMatch(a: ComparableEntry, b: ComparableEntry): boolean {
  if (!sharesField(a, b, "title") && !sharesField(a, b, "url")) {
    return false;
  }
  return a.normalized.username === b.normalized.username;
}

/**
 * How many of the merge fields two entries share, used only to pick the best
 * candidate among several that already matched.
 */
function matchScore(a: ComparableEntry, b: ComparableEntry): number {
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
    let match: ComparableEntry | undefined;
    let bestScore = 0;
    for (const candidate of targetEntries) {
      if (consumedTargetIds.has(candidate.entry.id.toString())) {
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
      newEntries.push(sourceEntry.entry);
      continue;
    }
    consumedTargetIds.add(match.entry.id.toString());
    const differences = diffEntries(match, sourceEntry);
    const pair: MatchedEntryPair = {
      targetEntry: match.entry,
      sourceEntry: sourceEntry.entry,
      differences,
    };
    if (differences.length === 0) {
      identical.push(pair);
    } else {
      conflicts.push(pair);
    }
  }

  return { newEntries, conflicts, identical };
}
