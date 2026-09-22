import { FormEvent, useState } from "react";
import {
  Entry,
  MatchedEntryPair,
  MergeFieldKey,
  Vault,
  VaultMergePlan,
  diffVaults,
} from "../../domain";
import {
  applyVaultMerge,
  ConflictResolution,
  ResolvedConflict,
  VaultMergeSelections,
} from "../../application/apply-vault-merge";
import { VaultMergeSource } from "../../application/vault-merge-source";
import { errorMessage } from "../error-message";
import { basename } from "../format";

interface MergeVaultWizardProps {
  vault: Vault;
  mergeSource: VaultMergeSource;
  onApply: (nextVault: Vault) => Promise<void>;
  onClose: () => void;
}

interface ReviewState {
  sourceFilePath: string;
  newEntryIds: Set<string>;
  resolutions: Map<string, ConflictResolution>;
  identicalIds: Set<string>;
}

const FIELD_LABELS: Record<MergeFieldKey, string> = {
  title: "Title",
  username: "Username",
  password: "Password",
  url: "URL",
  notes: "Notes",
  tags: "Tags",
  customFields: "Custom fields",
};

function pairKey(pair: MatchedEntryPair): string {
  return pair.targetEntry.id.toString();
}

function initialReviewState(
  sourceFilePath: string,
  newEntries: readonly Entry[],
  conflicts: readonly MatchedEntryPair[],
): ReviewState {
  const resolutions = new Map<string, ConflictResolution>();
  for (const pair of conflicts) {
    resolutions.set(pairKey(pair), "keep-mine");
  }
  return {
    sourceFilePath,
    // New entries default to accepted; identical pairs default to excluded
    // (there's nothing to gain from importing a byte-for-byte duplicate).
    newEntryIds: new Set(newEntries.map((entry) => entry.id.toString())),
    resolutions,
    identicalIds: new Set(),
  };
}

function buildSelections(plan: VaultMergePlan, review: ReviewState): VaultMergeSelections {
  const newEntries = plan.newEntries.filter((entry) => review.newEntryIds.has(entry.id.toString()));
  // `review.resolutions` is seeded with an entry for every conflict in `initialReviewState`,
  // so a lookup here always hits.
  const resolvedConflicts: ResolvedConflict[] = plan.conflicts.map((pair) => ({
    pair,
    resolution: review.resolutions.get(pairKey(pair))!,
  }));
  const identicalEntriesToImport = plan.identical
    .filter((pair) => review.identicalIds.has(pairKey(pair)))
    .map((pair) => pair.sourceEntry);
  return { newEntries, resolvedConflicts, identicalEntriesToImport };
}

function renderFieldValue(field: MergeFieldKey, value: string, revealSecrets: boolean): string {
  if (field === "password" && !revealSecrets) {
    return value === "" ? "" : "••••••••";
  }
  return value;
}

export function MergeVaultWizard({ vault, mergeSource, onApply, onClose }: MergeVaultWizardProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [plan, setPlan] = useState<VaultMergePlan | undefined>(undefined);
  const [review, setReview] = useState<ReviewState | undefined>(undefined);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [showIdentical, setShowIdentical] = useState(false);

  async function handleUnlockSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const opened = await mergeSource.pickAndOpen(password);
      if (!opened) {
        setBusy(false);
        return;
      }
      const nextPlan = diffVaults(vault, opened.vault);
      setPlan(nextPlan);
      setReview(initialReviewState(opened.filePath, nextPlan.newEntries, nextPlan.conflicts));
      setBusy(false);
    } catch (cause) {
      setError(errorMessage(cause, "Failed to open vault."));
      setBusy(false);
    }
  }

  function toggleNewEntry(id: string) {
    setReview((current) => {
      const newEntryIds = new Set(current!.newEntryIds);
      if (newEntryIds.has(id)) {
        newEntryIds.delete(id);
      } else {
        newEntryIds.add(id);
      }
      return { ...current!, newEntryIds };
    });
  }

  function toggleIdentical(id: string) {
    setReview((current) => {
      const identicalIds = new Set(current!.identicalIds);
      if (identicalIds.has(id)) {
        identicalIds.delete(id);
      } else {
        identicalIds.add(id);
      }
      return { ...current!, identicalIds };
    });
  }

  function setResolution(id: string, resolution: ConflictResolution) {
    setReview((current) => {
      const resolutions = new Map(current!.resolutions);
      resolutions.set(id, resolution);
      return { ...current!, resolutions };
    });
  }

  async function handleApply() {
    const currentPlan = plan!;
    const currentReview = review!;
    setBusy(true);
    setError(undefined);
    try {
      const selections = buildSelections(currentPlan, currentReview);
      const nextVault = applyVaultMerge(vault, selections);
      await onApply(nextVault);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, "Failed to apply the merge."));
      setBusy(false);
    }
  }

  if (!plan || !review) {
    return (
      <div className="modal-overlay">
        <div className="modal-card">
          <h2>Merge another vault in</h2>
          <p>
            Pick a `.kdbx` file to compare against this vault. Nothing changes until you review and
            apply the merge on the next step.
          </p>
          <form onSubmit={(event) => void handleUnlockSubmit(event)}>
            <div className="field-group">
              <label className="field-label" htmlFor="merge-master-password">
                Its master password
              </label>
              <input
                id="merge-master-password"
                type="password"
                className="field-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Master password"
                autoFocus
              />
            </div>
            {error && <div className="field-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                Choose file & continue
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const acceptedNewCount = plan.newEntries.filter((entry) =>
    review.newEntryIds.has(entry.id.toString()),
  ).length;
  const keepBothCount = plan.conflicts.filter(
    (pair) => review.resolutions.get(pairKey(pair)) === "keep-both",
  ).length;
  const useTheirsCount = plan.conflicts.filter(
    (pair) => review.resolutions.get(pairKey(pair)) === "use-theirs",
  ).length;
  const identicalImportCount = plan.identical.filter((pair) =>
    review.identicalIds.has(pairKey(pair)),
  ).length;

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-card-wide merge-wizard">
        <h2>Review merge from {basename(review.sourceFilePath)}</h2>
        <label className="merge-reveal-toggle">
          <input
            type="checkbox"
            checked={revealSecrets}
            onChange={(event) => setRevealSecrets(event.target.checked)}
          />
          Show secrets in diffs
        </label>

        <div className="merge-wizard-body">
          <section className="merge-section">
            <div className="detail-section-label">New entries ({plan.newEntries.length})</div>
            {plan.newEntries.length === 0 && <p className="merge-empty">Nothing new to import.</p>}
            {plan.newEntries.map((entry) => {
              const id = entry.id.toString();
              return (
                <label key={id} className="merge-entry-row">
                  <input
                    type="checkbox"
                    checked={review.newEntryIds.has(id)}
                    onChange={() => toggleNewEntry(id)}
                  />
                  <span className="merge-entry-title">{entry.title || "(untitled)"}</span>
                  <span className="merge-entry-username">{entry.username}</span>
                </label>
              );
            })}
          </section>

          <section className="merge-section">
            <div className="detail-section-label">Conflicts ({plan.conflicts.length})</div>
            {plan.conflicts.length === 0 && <p className="merge-empty">No conflicting entries.</p>}
            {plan.conflicts.map((pair) => {
              const id = pairKey(pair);
              const resolution = review.resolutions.get(id)!;
              return (
                <div key={id} className="merge-conflict-card">
                  <div className="merge-entry-title">{pair.targetEntry.title || "(untitled)"}</div>
                  <span className="merge-entry-username">{pair.targetEntry.username}</span>
                  <table className="merge-diff-table">
                    <tbody>
                      {pair.differences.map((difference) => (
                        <tr key={difference.field}>
                          <td>{FIELD_LABELS[difference.field]}</td>
                          <td>
                            {renderFieldValue(
                              difference.field,
                              difference.targetValue,
                              revealSecrets,
                            )}
                          </td>
                          <td>
                            {renderFieldValue(
                              difference.field,
                              difference.sourceValue,
                              revealSecrets,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="generator-mode-toggle" role="radiogroup" aria-label="Resolution">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={resolution === "keep-mine"}
                      className={`btn-secondary${resolution === "keep-mine" ? " active" : ""}`}
                      onClick={() => setResolution(id, "keep-mine")}
                    >
                      Keep mine
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={resolution === "use-theirs"}
                      className={`btn-secondary${resolution === "use-theirs" ? " active" : ""}`}
                      onClick={() => setResolution(id, "use-theirs")}
                    >
                      Use theirs
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={resolution === "keep-both"}
                      className={`btn-secondary${resolution === "keep-both" ? " active" : ""}`}
                      onClick={() => setResolution(id, "keep-both")}
                    >
                      Keep both
                    </button>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="merge-section">
            <button
              type="button"
              className="link-muted"
              onClick={() => setShowIdentical((value) => !value)}
            >
              {showIdentical ? "Hide" : "Show"} {plan.identical.length} identical entr
              {plan.identical.length === 1 ? "y" : "ies"}
            </button>
            {showIdentical &&
              plan.identical.map((pair) => {
                const id = pairKey(pair);
                return (
                  <label key={id} className="merge-entry-row">
                    <input
                      type="checkbox"
                      checked={review.identicalIds.has(id)}
                      onChange={() => toggleIdentical(id)}
                    />
                    <span className="merge-entry-title">
                      {pair.targetEntry.title || "(untitled)"}
                    </span>
                    <span className="merge-entry-username">{pair.targetEntry.username}</span>
                  </label>
                );
              })}
          </section>
        </div>

        {error && <div className="field-error">{error}</div>}
        <p className="merge-summary">
          {acceptedNewCount} new, {useTheirsCount} overwritten,{" "}
          {keepBothCount + identicalImportCount} kept as duplicates.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleApply()}
            disabled={busy}
          >
            Apply merge
          </button>
        </div>
      </div>
    </div>
  );
}
