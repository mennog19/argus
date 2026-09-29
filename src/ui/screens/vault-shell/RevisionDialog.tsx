import { ReactNode, useState } from "react";
import { Entry } from "../../../domain";
import { EntryAvatar } from "../../entry-icons/EntryAvatar";
import { formatDateTime } from "../../format";
import { CopyIcon, EyeIcon, EyeOffIcon, XIcon } from "../../icons";
import { useAsyncAction } from "../../use-async-action";
import { ClipboardCopy } from "../../use-clipboard-copy";

interface RevisionDialogProps {
  revision: Entry;
  clipboard: ClipboardCopy;
  onRestore: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

/** One earlier version of an entry, read-only, with what can be done to it. */
export function RevisionDialog({
  revision,
  clipboard,
  onRestore,
  onDelete,
  onClose,
}: RevisionDialogProps) {
  const [revealed, setRevealed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const title = revision.title || "(untitled)";
  const date = formatDateTime(revision.times.modifiedAt);
  const tags = revision.tags.values.map((tag) => tag.toString());
  const revealLabel = revealed ? "Hide password" : "Show password";

  async function act(action: () => Promise<void>, fallbackMessage: string) {
    if (await run(action, fallbackMessage)) {
      onClose();
    }
  }

  function copyButton(field: string, label: string, value: string) {
    return (
      <>
        {clipboard.copiedField === field && <span className="copied-label">Copied</span>}
        <button
          type="button"
          className="icon-button-small"
          aria-label={label}
          onClick={() => void clipboard.copy(value, field)}
        >
          <CopyIcon size={15} strokeWidth={2.25} />
        </button>
      </>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card entry-preview"
        role="dialog"
        aria-modal="true"
        aria-label={`Version of ${title} from ${date}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="entry-preview-header">
          <EntryAvatar entry={revision} />
          <div className="entry-preview-heading">
            <h2>{title}</h2>
            <p>Version from {date}</p>
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
          <Row label="Username">
            <span>{revision.username || "—"}</span>
            {revision.username &&
              copyButton("history-username", "Copy username", revision.username)}
          </Row>
          <Row label="Password">
            <span className={revealed ? undefined : "masked"}>
              {revealed ? revision.password.reveal() : revision.password.toString()}
            </span>
            <button
              type="button"
              className="icon-button-small"
              aria-label={revealLabel}
              title={revealLabel}
              onClick={() => setRevealed((value) => !value)}
            >
              {revealed ? (
                <EyeOffIcon size={15} strokeWidth={2.25} />
              ) : (
                <EyeIcon size={15} strokeWidth={2.25} />
              )}
            </button>
            {copyButton("history-password", "Copy password", revision.password.reveal())}
          </Row>
          <Row label="URL">
            <span>{revision.url || "—"}</span>
          </Row>
          <Row label="Tags">
            <span>{tags.length === 0 ? "—" : tags.join(", ")}</span>
          </Row>
          {revision.customFields.values.map((field) => (
            <Row key={field.key} label={field.key}>
              <span>{field.isProtected && !revealed ? "••••••••" : field.value}</span>
            </Row>
          ))}
          <Row label="Notes" notes>
            <span>{revision.notes || "—"}</span>
          </Row>
        </dl>
        <footer className="revision-actions">
          {confirmingDelete ? (
            <div className="group-inline-confirm">
              <span>Delete this version for good?</span>
              <button
                type="button"
                className="btn-ghost-sm"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger-sm"
                onClick={() => void act(onDelete, "Failed to delete this version.")}
                disabled={busy}
              >
                Delete
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn-ghost-sm-danger"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
              >
                Delete version
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void act(onRestore, "Failed to restore this version.")}
                disabled={busy}
              >
                Restore this version
              </button>
            </>
          )}
        </footer>
        {error && <div className="field-error revision-error">{error}</div>}
      </div>
    </div>
  );
}

function Row({ label, notes, children }: { label: string; notes?: boolean; children: ReactNode }) {
  return (
    <div className={`entry-preview-row${notes ? " notes" : ""}`}>
      <dt>{label}</dt>
      <dd className="revision-value">{children}</dd>
    </div>
  );
}
