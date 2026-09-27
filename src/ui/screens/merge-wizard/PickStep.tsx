import { Entry } from "../../../domain";
import { EntryAvatar } from "../../entry-icons/EntryAvatar";
import { StepHeading } from "./StepHeading";

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

export function PickStep({
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
