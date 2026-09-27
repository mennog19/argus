import { MatchedEntryPair } from "../../../domain";
import { ConflictResolution } from "../../../application/apply-vault-merge";
import { ConflictCard } from "./ConflictCard";
import { pairKey } from "./merge-review";
import { StepHeading } from "./StepHeading";

interface ConflictsStepProps {
  conflicts: readonly MatchedEntryPair[];
  resolutions: ReadonlyMap<string, ConflictResolution>;
  importingCount: number;
  revealSecrets: boolean;
  onResolve: (id: string, resolution: ConflictResolution) => void;
  onResolveAll: (resolution: ConflictResolution) => void;
}

export function ConflictsStep({
  conflicts,
  resolutions,
  importingCount,
  revealSecrets,
  onResolve,
  onResolveAll,
}: ConflictsStepProps) {
  return (
    <section className="merge-step-section">
      <StepHeading
        heading="Conflicts"
        lead="These entries matched something you already have, but at least one field differs. Pick a side per entry, or keep both as separate entries."
        count={
          conflicts.length === 0 ? undefined : `${importingCount} of ${conflicts.length} importing`
        }
        actions={
          conflicts.length > 0 && (
            <>
              <button
                type="button"
                className="btn-outline-sm"
                onClick={() => onResolveAll("use-theirs")}
              >
                Use theirs for all
              </button>
              <button
                type="button"
                className="btn-outline-sm"
                onClick={() => onResolveAll("keep-mine")}
              >
                Keep mine for all
              </button>
            </>
          )
        }
      />
      {conflicts.length === 0 ? (
        <p className="merge-empty">Nothing conflicts — every match was identical.</p>
      ) : (
        <div className="merge-conflict-list">
          {conflicts.map((pair, index) => (
            <ConflictCard
              key={pairKey(pair)}
              pair={pair}
              index={index}
              // Every conflict is seeded with a resolution by `initialReviewState`.
              resolution={resolutions.get(pairKey(pair))!}
              revealSecrets={revealSecrets}
              onResolve={(resolution) => onResolve(pairKey(pair), resolution)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
