import { CustomIcons, Entry, Group, GroupId, MatchedEntryPair, Vault } from "../domain";

export type ConflictResolution = "keep-mine" | "use-theirs" | "keep-both";

export interface ResolvedConflict {
  readonly pair: MatchedEntryPair;
  readonly resolution: ConflictResolution;
}

export interface VaultMergeSelections {
  readonly newEntries: readonly Entry[];
  readonly resolvedConflicts: readonly ResolvedConflict[];
  /** Source entries from `identical` pairs the user opted to import anyway. */
  readonly identicalEntriesToImport: readonly Entry[];
}

/** Name of the group newly-imported entries are collected into, created lazily under the vault root. */
export const MERGE_GROUP_NAME = "Merged in, to sort by user";

function ensureMergeGroup(vault: Vault): { vault: Vault; groupId: GroupId } {
  const existing = vault.rootGroup.groups.find((group) => group.name === MERGE_GROUP_NAME);
  if (existing) {
    return { vault, groupId: existing.id };
  }
  const group = Group.create(MERGE_GROUP_NAME);
  return { vault: vault.addGroup(vault.rootGroup.id, group), groupId: group.id };
}

/**
 * Folds the user's merge decisions into `target`: conflicts resolved as
 * "use theirs" are updated in place (keeping the target entry's id and
 * location); "keep both" conflicts, accepted new entries, and any
 * identical pairs the user chose to import anyway are all added into a
 * single lazily-created group so the target vault's existing groups are
 * left untouched. Custom icons the brought-over entries use are copied from
 * `sourceIcons`. Returns an ordinary in-memory `Vault` — callers persist it
 * the same way as any other edit.
 */
export function applyVaultMerge(
  target: Vault,
  selections: VaultMergeSelections,
  sourceIcons: CustomIcons = CustomIcons.EMPTY,
): Vault {
  return mergeEntries(target, selections).adoptCustomIcons(sourceIcons);
}

function mergeEntries(target: Vault, selections: VaultMergeSelections): Vault {
  let next = target;

  for (const { pair, resolution } of selections.resolvedConflicts) {
    if (resolution === "use-theirs") {
      next = next.updateEntry(
        pair.targetEntry.update({
          title: pair.sourceEntry.title,
          username: pair.sourceEntry.username,
          password: pair.sourceEntry.password,
          url: pair.sourceEntry.url,
          notes: pair.sourceEntry.notes,
          tags: pair.sourceEntry.tags,
          customFields: pair.sourceEntry.customFields,
          icon: pair.sourceEntry.icon,
        }),
      );
    }
  }

  const entriesToImport: Entry[] = [
    ...selections.newEntries,
    ...selections.resolvedConflicts
      .filter((resolved) => resolved.resolution === "keep-both")
      .map((resolved) => resolved.pair.sourceEntry),
    ...selections.identicalEntriesToImport,
  ];
  if (entriesToImport.length === 0) {
    return next;
  }

  const { vault: withGroup, groupId } = ensureMergeGroup(next);
  next = withGroup;
  for (const entry of entriesToImport) {
    next = next.addEntry(groupId, entry);
  }
  return next;
}
