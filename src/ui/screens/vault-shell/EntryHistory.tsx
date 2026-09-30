import { useId, useState } from "react";
import { changedEntryFields, Entry } from "../../../domain";
import { ChevronIcon } from "../../icons";
import { formatDateTime } from "../../format";
import { ClipboardCopy } from "../../use-clipboard-copy";
import { describeChanges } from "./history-summary";
import { RevisionDialog } from "./RevisionDialog";

interface EntryHistoryProps {
  /** The entry as stored, so revisions show their own `{REF:…}` text rather than today's values. */
  entry: Entry;
  clipboard: ClipboardCopy;
  onRestore: (index: number) => Promise<void>;
  onDelete: (index: number) => Promise<void>;
}

interface OpenRevision {
  readonly index: number;
  /**
   * Held rather than looked up by `index`: a restore or delete re-renders
   * with the saved history before the dialog closes, and by then `index` can
   * point at a different revision, or none.
   */
  readonly revision: Entry;
}

/**
 * The entry's earlier versions, newest first, each summarized by what the
 * edit after it changed. Collapsed by default: most visits to an entry are
 * for copying its current password, not for its past.
 */
export function EntryHistory({ entry, clipboard, onRestore, onDelete }: EntryHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<OpenRevision | undefined>(undefined);
  const listId = useId();
  const { history } = entry;
  // Each revision is compared with the version that replaced it.
  const rows = history
    .map((revision, index) => ({
      index,
      revision,
      summary: describeChanges(changedEntryFields(revision, history[index + 1] ?? entry)),
    }))
    .reverse();

  return (
    <div className="detail-card padded entry-history">
      <button
        type="button"
        className="entry-history-toggle"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={`entry-history-chevron${expanded ? " expanded" : ""}`}>
          <ChevronIcon size={12} />
        </span>
        <span className="field-label">History ({history.length})</span>
      </button>
      {expanded && (
        <ul id={listId} className="entry-history-list">
          {rows.map(({ index, revision, summary }) => (
            <li key={index}>
              <button
                type="button"
                className="entry-history-row"
                onClick={() => setOpen({ index, revision })}
              >
                <span className="entry-history-date">
                  {formatDateTime(revision.times.modifiedAt)}
                </span>
                <span className="entry-history-summary">{summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <RevisionDialog
          // A fresh dialog per revision, so reveal and confirm state don't carry over.
          key={open.index}
          revision={open.revision}
          clipboard={clipboard}
          onRestore={() => onRestore(open.index)}
          onDelete={() => onDelete(open.index)}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}
