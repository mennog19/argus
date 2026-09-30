import { Entry, MERGE_FIELDS, TOTP_FIELD_KEYS } from "../../../domain";
import { XIcon } from "../../icons";
import { EntryAvatar } from "../../entry-icons/EntryAvatar";
import { displayValue, FIELD_LABELS } from "./merge-field-display";

interface EntryPreviewDialogProps {
  entry: Entry;
  revealSecrets: boolean;
  onClose: () => void;
}

/**
 * The whole of an incoming entry, opened from the review step. The ledger only
 * compares five fields, so notes, tags and custom fields stay invisible until
 * someone asks to see what they're actually importing.
 */
export function EntryPreviewDialog({ entry, revealSecrets, onClose }: EntryPreviewDialogProps) {
  const title = entry.title || "(untitled)";
  // TOTP-only fields are already shown as "Authenticator".
  const extraFields = entry.customFields.values.filter((field) => !TOTP_FIELD_KEYS.has(field.key));
  const tags = entry.tags.values.map((tag) => tag.toString());
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card entry-preview"
        role="dialog"
        aria-modal="true"
        aria-label={`Entry ${title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="entry-preview-header">
          <EntryAvatar entry={entry} />
          <div className="entry-preview-heading">
            <h2>{title}</h2>
            <p>{entry.username || "No username"}</p>
          </div>
          <button
            type="button"
            className="entry-preview-close"
            aria-label="Close"
            onClick={onClose}
          >
            <XIcon size={13} />
          </button>
        </header>
        <dl className="entry-preview-body">
          {MERGE_FIELDS.filter((field) => field !== "title").map((field) => (
            <div className="entry-preview-row" key={field}>
              <dt>{FIELD_LABELS[field]}</dt>
              <dd>{displayValue(entry, field, revealSecrets)}</dd>
            </div>
          ))}
          <div className="entry-preview-row">
            <dt>Tags</dt>
            <dd>{tags.length === 0 ? "—" : tags.join(", ")}</dd>
          </div>
          {extraFields.map((field) => (
            <div className="entry-preview-row" key={field.key}>
              <dt>{field.key}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
          <div className="entry-preview-row notes">
            <dt>Notes</dt>
            <dd>{entry.notes || "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
