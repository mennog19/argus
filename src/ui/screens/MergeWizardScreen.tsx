import { ReactNode, useMemo, useState } from "react";
import {
  Entry,
  MatchedEntryPair,
  MERGE_FIELDS,
  MergeFieldKey,
  mergeFieldValue,
  Vault,
  VaultMergePlan,
  diffVaults,
} from "../../domain";
import {
  applyVaultMerge,
  ConflictResolution,
  MERGE_GROUP_NAME,
  ResolvedConflict,
  VaultMergeSelections,
} from "../../application/apply-vault-merge";
import { useAsyncAction } from "../use-async-action";
import { basename } from "../format";
import { EntryAvatar } from "../entry-icons/EntryAvatar";
import { CheckIcon, ChevronIcon, EyeIcon, EyeOffIcon, XIcon } from "../icons";

interface MergeWizardScreenProps {
  vault: Vault;
  filePath: string;
  /** The incoming vault, already unlocked by `MergeUnlockDialog`. */
  sourceVault: Vault;
  onApply: (nextVault: Vault) => Promise<void>;
  onClose: () => void;
}

interface ReviewState {
  newEntryIds: Set<string>;
  resolutions: Map<string, ConflictResolution>;
  identicalIds: Set<string>;
}

const FIELD_LABELS: Record<MergeFieldKey, string> = {
  title: "Title",
  username: "Username",
  password: "Password",
  url: "URL",
  totp: "Authenticator",
};

const RESOLUTION_CHOICES: ReadonlyArray<{
  value: ConflictResolution;
  label: string;
  hint: string;
}> = [
  { value: "keep-mine", label: "Keep mine", hint: "Skip the incoming one" },
  { value: "use-theirs", label: "Use theirs", hint: "Overwrite my entry" },
  { value: "keep-both", label: "Keep both", hint: "Import as a copy" },
];

const STEP_COUNT = 4;

function pairKey(pair: MatchedEntryPair): string {
  return pair.targetEntry.id.toString();
}

function initialReviewState(plan: VaultMergePlan): ReviewState {
  const resolutions = new Map<string, ConflictResolution>();
  for (const pair of plan.conflicts) {
    resolutions.set(pairKey(pair), "keep-mine");
  }
  return {
    // New entries default to accepted; identical pairs default to excluded
    // (there's nothing to gain from importing a byte-for-byte duplicate).
    newEntryIds: new Set(plan.newEntries.map((entry) => entry.id.toString())),
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

/**
 * How a merge field reads on screen. Secrets stay masked until the user asks
 * for them, and an absent value reads as a dash rather than an empty cell so
 * "mine has no URL, theirs does" is visible as a difference.
 */
function displayValue(entry: Entry, field: MergeFieldKey, revealSecrets: boolean): string {
  const value = mergeFieldValue(entry, field);
  if (value === "") {
    return field === "totp" ? "Not set" : "—";
  }
  if (field === "password") {
    return revealSecrets ? value : "••••••••";
  }
  if (field === "totp") {
    return revealSecrets ? value : "Configured";
  }
  return value;
}

export function MergeWizardScreen({
  vault,
  filePath,
  sourceVault,
  onApply,
  onClose,
}: MergeWizardScreenProps) {
  const plan = useMemo(() => diffVaults(vault, sourceVault), [vault, sourceVault]);
  const [review, setReview] = useState<ReviewState>(() => initialReviewState(plan));
  const { busy, error, run } = useAsyncAction();
  const [step, setStep] = useState(0);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<Entry | undefined>(undefined);

  function updateReview(patch: Partial<ReviewState>) {
    setReview((current) => ({ ...current, ...patch }));
  }

  function toggleId(ids: ReadonlySet<string>, id: string): Set<string> {
    const next = new Set(ids);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  }

  function setResolution(id: string, resolution: ConflictResolution) {
    const resolutions = new Map(review.resolutions);
    resolutions.set(id, resolution);
    updateReview({ resolutions });
  }

  function setAllResolutions(resolution: ConflictResolution) {
    const resolutions = new Map<string, ConflictResolution>();
    for (const pair of plan.conflicts) {
      resolutions.set(pairKey(pair), resolution);
    }
    updateReview({ resolutions });
  }

  async function handleApply() {
    // The wizard only closes once the merged vault is actually on disk.
    const applied = await run(
      () => onApply(applyVaultMerge(vault, buildSelections(plan, review))),
      "Failed to apply the merge.",
    );
    if (applied) {
      onClose();
    }
  }

  const acceptedNew = plan.newEntries.filter((entry) =>
    review.newEntryIds.has(entry.id.toString()),
  );
  const overwritten = plan.conflicts.filter(
    (pair) => review.resolutions.get(pairKey(pair)) === "use-theirs",
  );
  const keptBoth = plan.conflicts.filter(
    (pair) => review.resolutions.get(pairKey(pair)) === "keep-both",
  );
  const conflictsKeptMine = plan.conflicts.filter(
    (pair) => review.resolutions.get(pairKey(pair)) === "keep-mine",
  );
  const duplicatesImported = plan.identical.filter((pair) =>
    review.identicalIds.has(pairKey(pair)),
  );
  const skippedCount =
    plan.newEntries.length -
    acceptedNew.length +
    conflictsKeptMine.length +
    (plan.identical.length - duplicatesImported.length);

  const steps = [
    { label: "New", count: plan.newEntries.length },
    { label: "Conflicts", count: plan.conflicts.length },
    { label: "Duplicates", count: plan.identical.length },
    { label: "Review", count: undefined },
  ];

  return (
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

        <ol className="merge-steps">
          {steps.map((entry, index) => (
            <li
              key={entry.label}
              className={`merge-step${index === step ? " current" : ""}${
                index < step ? " done" : ""
              }`}
            >
              <button
                type="button"
                className="merge-step-button"
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
              >
                <span className="merge-step-node">
                  {index < step ? <CheckIcon size={13} /> : index + 1}
                </span>
                <span className="merge-step-text">
                  <span className="merge-step-label">{entry.label}</span>
                  {entry.count !== undefined && (
                    <span className="merge-step-count">{entry.count}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="merge-step-body">
          {step === 0 && (
            <PickStep
              heading="New passwords"
              lead="Nothing in this vault shares a title, username, password, URL or authenticator with these. Uncheck anything you'd rather not bring over."
              emptyText="The incoming vault has no entries that are new to you."
              entries={plan.newEntries.map((entry) => ({ id: entry.id.toString(), entry }))}
              selectedIds={review.newEntryIds}
              onToggle={(id) => updateReview({ newEntryIds: toggleId(review.newEntryIds, id) })}
              onSelectAll={() =>
                updateReview({
                  newEntryIds: new Set(plan.newEntries.map((entry) => entry.id.toString())),
                })
              }
              onSelectNone={() => updateReview({ newEntryIds: new Set() })}
            />
          )}

          {step === 1 && (
            <section className="merge-step-section">
              <StepHeading
                heading="Conflicts"
                lead="These entries matched something you already have, but at least one field differs. Pick a side per entry, or keep both as separate entries."
                count={
                  plan.conflicts.length === 0
                    ? undefined
                    : `${overwritten.length + keptBoth.length} of ${plan.conflicts.length} importing`
                }
                actions={
                  plan.conflicts.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="btn-outline-sm"
                        onClick={() => setAllResolutions("use-theirs")}
                      >
                        Use theirs for all
                      </button>
                      <button
                        type="button"
                        className="btn-outline-sm"
                        onClick={() => setAllResolutions("keep-mine")}
                      >
                        Keep mine for all
                      </button>
                    </>
                  )
                }
              />
              {plan.conflicts.length === 0 ? (
                <p className="merge-empty">Nothing conflicts — every match was identical.</p>
              ) : (
                <div className="merge-conflict-list">
                  {plan.conflicts.map((pair, index) => (
                    <ConflictCard
                      key={pairKey(pair)}
                      pair={pair}
                      index={index}
                      resolution={review.resolutions.get(pairKey(pair))!}
                      revealSecrets={revealSecrets}
                      onResolve={(resolution) => setResolution(pairKey(pair), resolution)}
                    />
                  ))}
                </div>
              )}
            </section>
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
              onToggle={(id) => updateReview({ identicalIds: toggleId(review.identicalIds, id) })}
              onSelectAll={() =>
                updateReview({ identicalIds: new Set(plan.identical.map(pairKey)) })
              }
              onSelectNone={() => updateReview({ identicalIds: new Set() })}
            />
          )}

          {step === 3 && (
            <section className="merge-step-section">
              <StepHeading
                heading="Review"
                lead={`Imported entries land in a group called "${MERGE_GROUP_NAME}" so nothing of yours moves.`}
              />
              <div className="merge-tally">
                <Tally label="Imported as new" value={acceptedNew.length} tone="accent" />
                <Tally label="Overwritten" value={overwritten.length} tone="warning" />
                <Tally
                  label="Copies kept"
                  value={keptBoth.length + duplicatesImported.length}
                  tone="accent"
                />
                <Tally label="Left out" value={skippedCount} tone="muted" />
              </div>
              <OutcomeList
                label="Imported as new"
                entries={acceptedNew}
                emptyText="No new entries selected."
                onInspect={setPreviewEntry}
              />
              <OutcomeList
                label="Overwriting my entry"
                entries={overwritten.map((pair) => pair.sourceEntry)}
                emptyText="No entries will be overwritten."
                onInspect={setPreviewEntry}
              />
              <OutcomeList
                label="Kept as a second copy"
                entries={[
                  ...keptBoth.map((pair) => pair.sourceEntry),
                  ...duplicatesImported.map((pair) => pair.sourceEntry),
                ]}
                emptyText="No duplicate copies will be created."
                onInspect={setPreviewEntry}
              />
              <OutcomeList
                label="Left out"
                entries={[
                  ...plan.newEntries.filter(
                    (entry) => !review.newEntryIds.has(entry.id.toString()),
                  ),
                  ...conflictsKeptMine.map((pair) => pair.sourceEntry),
                  ...plan.identical
                    .filter((pair) => !review.identicalIds.has(pairKey(pair)))
                    .map((pair) => pair.sourceEntry),
                ]}
                emptyText="Everything from the incoming vault is being imported."
                onInspect={setPreviewEntry}
              />
            </section>
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
  );
}

interface StepHeadingProps {
  heading: string;
  lead: string;
  count?: string;
  actions?: ReactNode;
}

function StepHeading({ heading, lead, count, actions }: StepHeadingProps) {
  return (
    <div className="merge-step-heading">
      <div className="merge-step-heading-text">
        <h2>{heading}</h2>
        <p>{lead}</p>
      </div>
      <div className="merge-step-heading-aside">
        {count && <span className="merge-step-tally">{count}</span>}
        {actions && <div className="merge-step-actions">{actions}</div>}
      </div>
    </div>
  );
}

interface PickStepProps {
  heading: string;
  lead: string;
  emptyText: string;
  entries: ReadonlyArray<{ id: string; entry: Entry }>;
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

function PickStep({
  heading,
  lead,
  emptyText,
  entries,
  selectedIds,
  onToggle,
  onSelectAll,
  onSelectNone,
}: PickStepProps) {
  const selectedCount = entries.filter((item) => selectedIds.has(item.id)).length;
  return (
    <section className="merge-step-section">
      <StepHeading
        heading={heading}
        lead={lead}
        count={entries.length === 0 ? undefined : `${selectedCount} of ${entries.length} selected`}
        actions={
          entries.length > 0 && (
            <>
              <button type="button" className="btn-outline-sm" onClick={onSelectAll}>
                Select all
              </button>
              <button type="button" className="btn-outline-sm" onClick={onSelectNone}>
                Select none
              </button>
            </>
          )
        }
      />
      {entries.length === 0 ? (
        <p className="merge-empty">{emptyText}</p>
      ) : (
        <div className="merge-pick-list">
          {entries.map(({ id, entry }, index) => (
            <label
              key={id}
              className={`merge-pick-row${selectedIds.has(id) ? " selected" : ""}`}
              style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(id)}
                onChange={() => onToggle(id)}
                aria-label={entry.title || "(untitled)"}
              />
              <EntryAvatar entry={entry} />
              <span className="merge-pick-text">
                <span className="merge-pick-title">{entry.title || "(untitled)"}</span>
                <span className="merge-pick-sub">{entry.username || "No username"}</span>
              </span>
              {entry.url && <span className="merge-pick-url">{entry.url}</span>}
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

interface ConflictCardProps {
  pair: MatchedEntryPair;
  index: number;
  resolution: ConflictResolution;
  revealSecrets: boolean;
  onResolve: (resolution: ConflictResolution) => void;
}

function ConflictCard({ pair, index, resolution, revealSecrets, onResolve }: ConflictCardProps) {
  const differing = new Set(pair.differences.map((difference) => difference.field));
  const heading = pair.targetEntry.title || pair.sourceEntry.title || "(untitled)";
  return (
    <article
      className={`merge-conflict ${resolution}`}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <header className="merge-conflict-header">
        <EntryAvatar entry={pair.sourceEntry} />
        <div className="merge-conflict-heading">
          <h3>{heading}</h3>
          <p>{pair.targetEntry.username || pair.sourceEntry.username || "No username"}</p>
        </div>
        <span className="merge-diff-badge">
          {pair.differences.length} {pair.differences.length === 1 ? "difference" : "differences"}
        </span>
      </header>

      <div className="merge-ledger">
        <div className="merge-ledger-head">
          <span />
          <span className="merge-ledger-side mine">In this vault</span>
          <span />
          <span className="merge-ledger-side theirs">Incoming</span>
        </div>
        {MERGE_FIELDS.map((field) => {
          if (!differing.has(field)) {
            return (
              <div className="merge-ledger-row same" key={field}>
                <span className="merge-ledger-field">{FIELD_LABELS[field]}</span>
                <span className="merge-ledger-shared">
                  {displayValue(pair.targetEntry, field, revealSecrets)}
                </span>
              </div>
            );
          }
          return (
            <div className="merge-ledger-row differs" key={field}>
              <span className="merge-ledger-field">{FIELD_LABELS[field]}</span>
              <span className="merge-ledger-value mine">
                {displayValue(pair.targetEntry, field, revealSecrets)}
              </span>
              <span className="merge-ledger-mark" aria-hidden="true">
                ≠
              </span>
              <span className="merge-ledger-value theirs">
                {displayValue(pair.sourceEntry, field, revealSecrets)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="merge-choice" role="radiogroup" aria-label={`Resolution for ${heading}`}>
        {RESOLUTION_CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={resolution === choice.value}
            className={`merge-choice-option${resolution === choice.value ? " active" : ""}`}
            onClick={() => onResolve(choice.value)}
          >
            <span className="merge-choice-label">{choice.label}</span>
            <span className="merge-choice-hint">{choice.hint}</span>
          </button>
        ))}
      </div>
    </article>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "warning" | "muted";
}) {
  return (
    <div className={`merge-tally-card ${tone}`}>
      <span className="merge-tally-value">{value}</span>
      <span className="merge-tally-label">{label}</span>
    </div>
  );
}

function OutcomeList({
  label,
  entries,
  emptyText,
  onInspect,
}: {
  label: string;
  entries: readonly Entry[];
  emptyText: string;
  onInspect: (entry: Entry) => void;
}) {
  return (
    <section className="merge-outcome">
      <div className="detail-section-label">
        {label} ({entries.length})
      </div>
      {entries.length === 0 ? (
        <p className="merge-empty">{emptyText}</p>
      ) : (
        <ul className="merge-outcome-list">
          {entries.map((entry) => (
            <li key={entry.id.toString()}>
              <button type="button" className="merge-outcome-row" onClick={() => onInspect(entry)}>
                <EntryAvatar entry={entry} />
                <span className="merge-pick-text">
                  <span className="merge-pick-title">{entry.title || "(untitled)"}</span>
                  <span className="merge-pick-sub">{entry.username || "No username"}</span>
                </span>
                <span className="merge-outcome-open" aria-hidden="true">
                  <ChevronIcon size={11} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Custom-field keys that only carry TOTP; already shown as "Authenticator". */
const TOTP_FIELD_KEYS: readonly string[] = ["otp", "TOTP Seed", "TOTP Settings"];

/**
 * The whole of an incoming entry, opened from the review step. The ledger only
 * compares five fields, so notes, tags and custom fields stay invisible until
 * someone asks to see what they're actually importing.
 */
function EntryPreviewDialog({
  entry,
  revealSecrets,
  onClose,
}: {
  entry: Entry;
  revealSecrets: boolean;
  onClose: () => void;
}) {
  const title = entry.title || "(untitled)";
  const extraFields = entry.customFields.values.filter(
    (field) => !TOTP_FIELD_KEYS.includes(field.key),
  );
  const tags = entry.tags.values.map((tag) => tag.toString());
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card merge-preview"
        role="dialog"
        aria-modal="true"
        aria-label={`Entry ${title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="merge-preview-header">
          <EntryAvatar entry={entry} />
          <div className="merge-preview-heading">
            <h2>{title}</h2>
            <p>{entry.username || "No username"}</p>
          </div>
          <button
            type="button"
            className="merge-preview-close"
            aria-label="Close"
            onClick={onClose}
          >
            <XIcon size={13} />
          </button>
        </header>
        <dl className="merge-preview-body">
          {MERGE_FIELDS.filter((field) => field !== "title").map((field) => (
            <div className="merge-preview-row" key={field}>
              <dt>{FIELD_LABELS[field]}</dt>
              <dd>{displayValue(entry, field, revealSecrets)}</dd>
            </div>
          ))}
          <div className="merge-preview-row">
            <dt>Tags</dt>
            <dd>{tags.length === 0 ? "—" : tags.join(", ")}</dd>
          </div>
          {extraFields.map((field) => (
            <div className="merge-preview-row" key={field.key}>
              <dt>{field.key}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
          <div className="merge-preview-row notes">
            <dt>Notes</dt>
            <dd>{entry.notes || "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
