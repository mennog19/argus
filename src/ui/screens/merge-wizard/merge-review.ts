import { Entry, MatchedEntryPair, VaultMergePlan } from "../../../domain";
import {
  ConflictResolution,
  ResolvedConflict,
  VaultMergeSelections,
} from "../../../application/apply-vault-merge";

/** What the user has chosen so far, keyed by entry id (conflicts/duplicates by *their* entry's id). */
export interface ReviewState {
  readonly newEntryIds: ReadonlySet<string>;
  readonly resolutions: ReadonlyMap<string, ConflictResolution>;
  readonly identicalIds: ReadonlySet<string>;
}

/** Where every incoming entry ends up under the current choices, for the review step. */
export interface ReviewOutcome {
  readonly importedAsNew: readonly Entry[];
  readonly overwriting: readonly Entry[];
  readonly copies: readonly Entry[];
  readonly leftOut: readonly Entry[];
}

export function pairKey(pair: MatchedEntryPair): string {
  return pair.targetEntry.id.toString();
}

export function initialReviewState(plan: VaultMergePlan): ReviewState {
  return {
    // New entries default to accepted; identical pairs default to excluded
    // (there's nothing to gain from importing a byte-for-byte duplicate).
    newEntryIds: new Set(plan.newEntries.map((entry) => entry.id.toString())),
    resolutions: new Map(plan.conflicts.map((pair) => [pairKey(pair), "keep-mine"])),
    identicalIds: new Set(),
  };
}

export function withResolution(
  review: ReviewState,
  id: string,
  resolution: ConflictResolution,
): ReviewState {
  return { ...review, resolutions: new Map(review.resolutions).set(id, resolution) };
}

export function withAllResolutions(
  plan: VaultMergePlan,
  review: ReviewState,
  resolution: ConflictResolution,
): ReviewState {
  return {
    ...review,
    resolutions: new Map(plan.conflicts.map((pair) => [pairKey(pair), resolution])),
  };
}

function resolutionOf(review: ReviewState, pair: MatchedEntryPair): ConflictResolution {
  // `resolutions` is seeded with every conflict by `initialReviewState`, and
  // only ever replaced wholesale or per key after that, so a lookup always hits.
  return review.resolutions.get(pairKey(pair))!;
}

export function buildSelections(plan: VaultMergePlan, review: ReviewState): VaultMergeSelections {
  const newEntries = plan.newEntries.filter((entry) => review.newEntryIds.has(entry.id.toString()));
  const resolvedConflicts: ResolvedConflict[] = plan.conflicts.map((pair) => ({
    pair,
    resolution: resolutionOf(review, pair),
  }));
  const identicalEntriesToImport = plan.identical
    .filter((pair) => review.identicalIds.has(pairKey(pair)))
    .map((pair) => pair.sourceEntry);
  return { newEntries, resolvedConflicts, identicalEntriesToImport };
}

/** How many conflicts will bring the incoming entry over, either on top of mine or beside it. */
export function importingConflictCount(plan: VaultMergePlan, review: ReviewState): number {
  return plan.conflicts.filter((pair) => resolutionOf(review, pair) !== "keep-mine").length;
}

export function summarizeReview(plan: VaultMergePlan, review: ReviewState): ReviewOutcome {
  const conflictsResolvedAs = (resolution: ConflictResolution) =>
    plan.conflicts
      .filter((pair) => resolutionOf(review, pair) === resolution)
      .map((pair) => pair.sourceEntry);
  const identicalWhere = (imported: boolean) =>
    plan.identical
      .filter((pair) => review.identicalIds.has(pairKey(pair)) === imported)
      .map((pair) => pair.sourceEntry);
  const newWhere = (accepted: boolean) =>
    plan.newEntries.filter((entry) => review.newEntryIds.has(entry.id.toString()) === accepted);

  return {
    importedAsNew: newWhere(true),
    overwriting: conflictsResolvedAs("use-theirs"),
    copies: [...conflictsResolvedAs("keep-both"), ...identicalWhere(true)],
    leftOut: [...newWhere(false), ...conflictsResolvedAs("keep-mine"), ...identicalWhere(false)],
  };
}
