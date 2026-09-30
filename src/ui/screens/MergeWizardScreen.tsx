import { useMemo, useState } from "react";
import { Entry, Vault, diffVaults } from "../../domain";
import { applyVaultMerge } from "../../application/apply-vault-merge";
import { CustomIconsContext } from "../entry-icons/custom-icons-context";
import { useAsyncAction } from "../use-async-action";
import { basename } from "../format";
import { EyeIcon, EyeOffIcon } from "../icons";
import { toggleMember } from "../toggle-member";
import { ConflictsStep } from "./merge-wizard/ConflictsStep";
import { EntryPreviewDialog } from "./merge-wizard/EntryPreviewDialog";
import {
  buildSelections,
  importingConflictCount,
  initialReviewState,
  pairKey,
  ReviewState,
  summarizeReview,
  withAllResolutions,
  withResolution,
} from "./merge-wizard/merge-review";
import { MergeStepper } from "./merge-wizard/MergeStepper";
import { PickStep } from "./merge-wizard/PickStep";
import { ReviewStep } from "./merge-wizard/ReviewStep";

interface MergeWizardScreenProps {
  vault: Vault;
  filePath: string;
  /** The incoming vault, already unlocked by `MergeUnlockDialog`. */
  sourceVault: Vault;
  onApply: (nextVault: Vault) => Promise<void>;
  onClose: () => void;
}

const STEP_COUNT = 4;

export function MergeWizardScreen({
  vault,
  filePath,
  sourceVault,
  onApply,
  onClose,
}: MergeWizardScreenProps) {
  const plan = useMemo(() => diffVaults(vault, sourceVault), [vault, sourceVault]);
  // Both sides' images, so incoming entries show theirs while being reviewed.
  const customIcons = useMemo(
    () => ({
      icons: sourceVault.customIcons.values.reduce(
        (icons, icon) => (icons.has(icon.id) ? icons : icons.add(icon)),
        vault.customIcons,
      ),
    }),
    [vault, sourceVault],
  );
  const [review, setReview] = useState<ReviewState>(() => initialReviewState(plan));
  const { busy, error, run } = useAsyncAction();
  const [step, setStep] = useState(0);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<Entry | undefined>(undefined);

  function updateReview(patch: Partial<ReviewState>) {
    setReview((current) => ({ ...current, ...patch }));
  }

  async function handleApply() {
    // The wizard only closes once the merged vault is actually on disk.
    const applied = await run(
      () => onApply(applyVaultMerge(vault, buildSelections(plan, review), sourceVault.customIcons)),
      "Failed to apply the merge.",
    );
    if (applied) {
      onClose();
    }
  }

  const steps = [
    { label: "New", count: plan.newEntries.length },
    { label: "Conflicts", count: plan.conflicts.length },
    { label: "Duplicates", count: plan.identical.length },
    { label: "Review" },
  ];

  return (
    <CustomIconsContext value={customIcons}>
      <div className="detail-pane merge-pane">
        <div className="merge-wizard">
          <header className="merge-wizard-header">
            <div className="merge-wizard-heading">
              <h1 className="detail-title">Merge vault</h1>
              <p className="merge-wizard-source">{basename(filePath)}</p>
            </div>
            <button
              type="button"
              className="merge-reveal-toggle"
              aria-pressed={revealSecrets}
              onClick={() => setRevealSecrets((value) => !value)}
            >
              {revealSecrets ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
              {revealSecrets ? "Hide secrets" : "Show secrets"}
            </button>
          </header>

          <MergeStepper steps={steps} current={step} onSelect={setStep} />

          <div className="merge-step-body">
            {step === 0 && (
              <PickStep
                heading="New passwords"
                lead="Nothing in this vault shares a title, username, password, URL or authenticator with these. Uncheck anything you'd rather not bring over."
                emptyText="The incoming vault has no entries that are new to you."
                entries={plan.newEntries.map((entry) => ({ id: entry.id.toString(), entry }))}
                selectedIds={review.newEntryIds}
                onToggle={(id) =>
                  updateReview({ newEntryIds: toggleMember(review.newEntryIds, id) })
                }
                onSelectAll={() =>
                  updateReview({
                    newEntryIds: new Set(plan.newEntries.map((entry) => entry.id.toString())),
                  })
                }
                onSelectNone={() => updateReview({ newEntryIds: new Set() })}
              />
            )}

            {step === 1 && (
              <ConflictsStep
                conflicts={plan.conflicts}
                resolutions={review.resolutions}
                importingCount={importingConflictCount(plan, review)}
                revealSecrets={revealSecrets}
                onResolve={(id, resolution) =>
                  setReview((current) => withResolution(current, id, resolution))
                }
                onResolveAll={(resolution) =>
                  setReview((current) => withAllResolutions(plan, current, resolution))
                }
              />
            )}

            {step === 2 && (
              <PickStep
                heading="Exact duplicates"
                lead="Every compared field matches an entry you already have, so these are left out by default. Check one only if you deliberately want a second copy."
                emptyText="No exact duplicates between the two vaults."
                entries={plan.identical.map((pair) => ({
                  id: pairKey(pair),
                  entry: pair.sourceEntry,
                }))}
                selectedIds={review.identicalIds}
                onToggle={(id) =>
                  updateReview({ identicalIds: toggleMember(review.identicalIds, id) })
                }
                onSelectAll={() =>
                  updateReview({ identicalIds: new Set(plan.identical.map(pairKey)) })
                }
                onSelectNone={() => updateReview({ identicalIds: new Set() })}
              />
            )}

            {step === 3 && (
              <ReviewStep outcome={summarizeReview(plan, review)} onInspect={setPreviewEntry} />
            )}
          </div>

          {error && <div className="field-error">{error}</div>}

          <footer className="merge-wizard-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <div className="merge-wizard-footer-right">
              {step > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep(step - 1)}
                  disabled={busy}
                >
                  Back
                </button>
              )}
              {step < STEP_COUNT - 1 ? (
                <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleApply()}
                  disabled={busy}
                >
                  Apply merge
                </button>
              )}
            </div>
          </footer>
        </div>

        {previewEntry && (
          <EntryPreviewDialog
            entry={previewEntry}
            revealSecrets={revealSecrets}
            onClose={() => setPreviewEntry(undefined)}
          />
        )}
      </div>
    </CustomIconsContext>
  );
}
