import { ChangeEvent, FormEvent, useState } from "react";
import { Attachment, Attachments, MAX_ATTACHMENT_BYTES } from "../../../domain";
import { formatFileSize } from "../../format";
import { DownloadIcon, EditIcon, TrashIcon } from "../../icons";
import { useAsyncAction } from "../../use-async-action";

interface EntryAttachmentsProps {
  attachments: Attachments;
  onAdd: (added: readonly Attachment[]) => Promise<void>;
  onRename: (name: string, newName: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  /** Resolves to the path the copy was saved at, or `undefined` if the user cancelled. */
  onExport: (attachment: Attachment) => Promise<string | undefined>;
}

/** The one row being renamed or about to be deleted; every other row stays as it is. */
type RowAction =
  | { readonly kind: "rename"; readonly name: string; readonly draft: string }
  | { readonly kind: "delete"; readonly name: string };

async function attachmentFromFile(file: File): Promise<Attachment> {
  // KDBX 3 has no way to write a binary without bytes; it would be gone on the next open.
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty, so there's nothing to attach.`);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `"${file.name}" is too large. Attachments can be up to ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`,
    );
  }
  return new Attachment(file.name, new Uint8Array(await file.arrayBuffer()));
}

/**
 * The files stored inside an entry. Each change is saved straight away, like
 * restoring a history revision, rather than waiting on the entry's edit form.
 */
export function EntryAttachments({
  attachments,
  onAdd,
  onRename,
  onRemove,
  onExport,
}: EntryAttachmentsProps) {
  const [action, setAction] = useState<RowAction | undefined>(undefined);
  const [savedPath, setSavedPath] = useState<string | undefined>(undefined);
  const { busy, error, run, clearError } = useAsyncAction();
  const files = attachments.values;

  function begin(next: RowAction | undefined) {
    setAction(next);
    setSavedPath(undefined);
    clearError();
  }

  async function handleAdd(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const picked = Array.from(input.files ?? []);
    // Cleared so picking the same file again still fires a change.
    input.value = "";
    if (picked.length === 0) {
      return;
    }
    begin(undefined);
    await run(
      async () => onAdd(await Promise.all(picked.map(attachmentFromFile))),
      "Couldn't attach that file.",
    );
  }

  async function handleExport(attachment: Attachment) {
    begin(undefined);
    await run(
      async () => setSavedPath(await onExport(attachment)),
      "Couldn't save a copy of that file.",
    );
  }

  async function handleRename(event: FormEvent, name: string, draft: string) {
    event.preventDefault();
    if (await run(() => onRename(name, draft.trim()), "Couldn't rename that file.")) {
      setAction(undefined);
    }
  }

  async function handleRemove(name: string) {
    if (await run(() => onRemove(name), "Couldn't delete that file.")) {
      setAction(undefined);
    }
  }

  function renderRow(attachment: Attachment) {
    const { name } = attachment;
    if (action?.name === name && action.kind === "rename") {
      return (
        <form
          className="entry-attachment-rename"
          onSubmit={(event) => void handleRename(event, name, action.draft)}
        >
          <input
            type="text"
            className="field-input"
            aria-label={`New name for ${name}`}
            value={action.draft}
            autoFocus
            onChange={(event) => setAction({ kind: "rename", name, draft: event.target.value })}
          />
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={() => begin(undefined)}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className="btn-accent-sm" disabled={busy}>
            Rename
          </button>
        </form>
      );
    }
    if (action?.name === name) {
      return (
        <div className="group-inline-confirm">
          <span>Delete {name}? Versions in this entry's history keep their copy.</span>
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={() => begin(undefined)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger-sm"
            onClick={() => void handleRemove(name)}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      );
    }
    return (
      <div className="entry-attachment-row">
        <span className="entry-attachment-name" title={name}>
          {name}
        </span>
        <span className="entry-attachment-size">{formatFileSize(attachment.size)}</span>
        <div className="detail-field-actions">
          <button
            type="button"
            className="icon-button-small"
            aria-label={`Save a copy of ${name}`}
            title="Save a copy…"
            disabled={busy}
            onClick={() => void handleExport(attachment)}
          >
            <DownloadIcon size={15} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="icon-button-small"
            aria-label={`Rename ${name}`}
            title="Rename"
            disabled={busy}
            onClick={() => begin({ kind: "rename", name, draft: name })}
          >
            <EditIcon size={15} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="icon-button-small"
            aria-label={`Delete ${name}`}
            title="Delete"
            disabled={busy}
            onClick={() => begin({ kind: "delete", name })}
          >
            <TrashIcon size={15} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-card padded entry-attachments">
      <div className="entry-attachments-header">
        <span className="field-label">
          {files.length === 0 ? "Attachments" : `Attachments (${files.length})`}
        </span>
        <label className="btn-secondary icon-picker-upload" aria-disabled={busy}>
          Add file…
          <input
            type="file"
            multiple
            aria-label="Add attachment"
            disabled={busy}
            onChange={(event) => void handleAdd(event)}
          />
        </label>
      </div>
      {files.length > 0 && (
        <ul className="entry-attachment-list">
          {files.map((attachment) => (
            <li key={attachment.name}>{renderRow(attachment)}</li>
          ))}
        </ul>
      )}
      {error && <div className="field-error">{error}</div>}
      {savedPath && (
        <div className="field-success">Saved a copy to {savedPath}. It isn't encrypted there.</div>
      )}
    </div>
  );
}
