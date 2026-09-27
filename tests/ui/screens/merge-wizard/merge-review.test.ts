import { describe, expect, it } from "vitest";
import { diffVaults, Entry, Group, Vault, VaultMergePlan } from "../../../../src/domain";
import {
  buildSelections,
  importingConflictCount,
  initialReviewState,
  pairKey,
  ReviewState,
  summarizeReview,
  withAllResolutions,
  withResolution,
} from "../../../../src/ui/screens/merge-wizard/merge-review";

function vaultWith(name: string, entries: readonly Entry[]): Vault {
  let root = Group.create(name);
  for (const entry of entries) {
    root = root.addEntry(entry);
  }
  return new Vault(name, root);
}

function titles(entries: readonly Entry[]): string[] {
  return entries.map((entry) => entry.title);
}

/** Two new entries, one conflict (Bank: same account, different URL), one exact duplicate (Forum). */
function samplePlan(): VaultMergePlan {
  const target = vaultWith("Mine", [
    Entry.create({ title: "Bank", username: "alice", url: "https://bank.example" }),
    Entry.create({ title: "Forum", username: "carol" }),
  ]);
  const source = vaultWith("Theirs", [
    Entry.create({ title: "Bank", username: "alice", url: "https://bank.example/login" }),
    Entry.create({ title: "Forum", username: "carol" }),
    Entry.create({ title: "Shop", username: "dave" }),
    Entry.create({ title: "Mail", username: "erin" }),
  ]);
  return diffVaults(target, source);
}

describe("merge-review", () => {
  it("keys a matched pair by the entry already in this vault", () => {
    const [pair] = samplePlan().conflicts;
    expect(pairKey(pair)).toBe(pair.targetEntry.id.toString());
  });

  describe("initialReviewState", () => {
    it("accepts every new entry, keeps mine on every conflict, and imports no duplicates", () => {
      const plan = samplePlan();
      const review = initialReviewState(plan);

      expect(review.newEntryIds).toEqual(
        new Set(plan.newEntries.map((entry) => entry.id.toString())),
      );
      expect([...review.resolutions.values()]).toEqual(["keep-mine"]);
      expect(review.identicalIds.size).toBe(0);
    });
  });

  describe("withResolution / withAllResolutions", () => {
    it("changes one conflict's resolution without mutating the original state", () => {
      const plan = samplePlan();
      const review = initialReviewState(plan);
      const key = pairKey(plan.conflicts[0]);

      const next = withResolution(review, key, "use-theirs");

      expect(next.resolutions.get(key)).toBe("use-theirs");
      expect(review.resolutions.get(key)).toBe("keep-mine");
    });

    it("sets every conflict to the same resolution", () => {
      const plan = samplePlan();
      const next = withAllResolutions(plan, initialReviewState(plan), "keep-both");

      expect([...next.resolutions.values()]).toEqual(["keep-both"]);
    });
  });

  describe("buildSelections", () => {
    it("passes on only the accepted new entries, every resolved conflict, and chosen duplicates", () => {
      const plan = samplePlan();
      const [shop] = plan.newEntries;
      const review: ReviewState = {
        newEntryIds: new Set([shop.id.toString()]),
        resolutions: new Map([[pairKey(plan.conflicts[0]), "use-theirs"]]),
        identicalIds: new Set([pairKey(plan.identical[0])]),
      };

      const selections = buildSelections(plan, review);

      expect(titles(selections.newEntries)).toEqual(["Shop"]);
      expect(selections.resolvedConflicts).toEqual([
        { pair: plan.conflicts[0], resolution: "use-theirs" },
      ]);
      expect(titles(selections.identicalEntriesToImport)).toEqual(["Forum"]);
    });
  });

  describe("importingConflictCount", () => {
    it("counts conflicts that bring the incoming entry over, whether overwriting or as a copy", () => {
      const plan = samplePlan();
      const review = initialReviewState(plan);

      expect(importingConflictCount(plan, review)).toBe(0);
      expect(importingConflictCount(plan, withAllResolutions(plan, review, "use-theirs"))).toBe(1);
      expect(importingConflictCount(plan, withAllResolutions(plan, review, "keep-both"))).toBe(1);
    });
  });

  describe("summarizeReview", () => {
    it("with the defaults, imports the new entries and leaves out the conflict and duplicate", () => {
      const plan = samplePlan();

      const outcome = summarizeReview(plan, initialReviewState(plan));

      expect(titles(outcome.importedAsNew)).toEqual(["Shop", "Mail"]);
      expect(outcome.overwriting).toEqual([]);
      expect(outcome.copies).toEqual([]);
      expect(titles(outcome.leftOut)).toEqual(["Bank", "Forum"]);
    });

    it("sorts every incoming entry into exactly one outcome", () => {
      const plan = samplePlan();
      const [shop] = plan.newEntries;
      const review: ReviewState = {
        newEntryIds: new Set([shop.id.toString()]),
        resolutions: new Map([[pairKey(plan.conflicts[0]), "keep-both"]]),
        identicalIds: new Set([pairKey(plan.identical[0])]),
      };

      const outcome = summarizeReview(plan, review);

      expect(titles(outcome.importedAsNew)).toEqual(["Shop"]);
      expect(outcome.overwriting).toEqual([]);
      expect(titles(outcome.copies)).toEqual(["Bank", "Forum"]);
      expect(titles(outcome.leftOut)).toEqual(["Mail"]);
    });

    it("lists a conflict resolved as use-theirs as overwriting", () => {
      const plan = samplePlan();
      const review = withAllResolutions(plan, initialReviewState(plan), "use-theirs");

      expect(titles(summarizeReview(plan, review).overwriting)).toEqual(["Bank"]);
    });
  });
});
