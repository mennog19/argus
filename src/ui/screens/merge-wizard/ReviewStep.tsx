import { Entry } from "../../../domain";
import { MERGE_GROUP_NAME } from "../../../application/apply-vault-merge";
import { EntryAvatar } from "../../entry-icons/EntryAvatar";
import { ChevronIcon } from "../../icons";
import { ReviewOutcome } from "./merge-review";
import { StepHeading } from "./StepHeading";

interface ReviewStepProps {
  outcome: ReviewOutcome;
  onInspect: (entry: Entry) => void;
}

export function ReviewStep({ outcome, onInspect }: ReviewStepProps) {
  const { importedAsNew, overwriting, copies, leftOut } = outcome;
  return (
    <section className="merge-step-section">
      <StepHeading
        heading="Review"
        lead={`Imported entries land in a group called "${MERGE_GROUP_NAME}" so nothing of yours moves.`}
      />
      <div className="merge-tally">
        <Tally label="Imported as new" value={importedAsNew.length} tone="accent" />
        <Tally label="Overwritten" value={overwriting.length} tone="warning" />
        <Tally label="Copies kept" value={copies.length} tone="accent" />
        <Tally label="Left out" value={leftOut.length} tone="muted" />
      </div>
      <OutcomeList
        label="Imported as new"
        entries={importedAsNew}
        emptyText="No new entries selected."
        onInspect={onInspect}
      />
      <OutcomeList
        label="Overwriting my entry"
        entries={overwriting}
        emptyText="No entries will be overwritten."
        onInspect={onInspect}
      />
      <OutcomeList
        label="Kept as a second copy"
        entries={copies}
        emptyText="No duplicate copies will be created."
        onInspect={onInspect}
      />
      <OutcomeList
        label="Left out"
        entries={leftOut}
        emptyText="Everything from the incoming vault is being imported."
        onInspect={onInspect}
      />
    </section>
  );
}

interface TallyProps {
  label: string;
  value: number;
  tone: "accent" | "warning" | "muted";
}

function Tally({ label, value, tone }: TallyProps) {
  return (
    <div className={`merge-tally-card ${tone}`}>
      <span className="merge-tally-value">{value}</span>
      <span className="merge-tally-label">{label}</span>
    </div>
  );
}

interface OutcomeListProps {
  label: string;
  entries: readonly Entry[];
  emptyText: string;
  onInspect: (entry: Entry) => void;
}

function OutcomeList({ label, entries, emptyText, onInspect }: OutcomeListProps) {
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
