import { MatchedEntryPair, MERGE_FIELDS } from "../../../domain";
import { ConflictResolution } from "../../../application/apply-vault-merge";
import { EntryAvatar } from "../../entry-icons/EntryAvatar";
import { displayValue, FIELD_LABELS } from "./merge-field-display";

const RESOLUTION_CHOICES: ReadonlyArray<{
  value: ConflictResolution;
  label: string;
  hint: string;
}> = [
  { value: "keep-mine", label: "Keep mine", hint: "Skip the incoming one" },
  { value: "use-theirs", label: "Use theirs", hint: "Overwrite my entry" },
  { value: "keep-both", label: "Keep both", hint: "Import as a copy" },
];

interface ConflictCardProps {
  pair: MatchedEntryPair;
  index: number;
  resolution: ConflictResolution;
  revealSecrets: boolean;
  onResolve: (resolution: ConflictResolution) => void;
}

export function ConflictCard({
  pair,
  index,
  resolution,
  revealSecrets,
  onResolve,
}: ConflictCardProps) {
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
        {MERGE_FIELDS.map((field) =>
          differing.has(field) ? (
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
          ) : (
            <div className="merge-ledger-row same" key={field}>
              <span className="merge-ledger-field">{FIELD_LABELS[field]}</span>
              <span className="merge-ledger-shared">
                {displayValue(pair.targetEntry, field, revealSecrets)}
              </span>
            </div>
          ),
        )}
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
