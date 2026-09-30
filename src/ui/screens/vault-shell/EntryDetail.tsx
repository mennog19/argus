import { useMemo, useState } from "react";
import {
  FieldReferences,
  openableUrl,
  TOTP_FIELD_KEYS,
  totpConfigFromCustomFields,
} from "../../../domain";
import { UrlOpener } from "../../../application/url-opener";
import { EntryAvatar } from "../../entry-icons/EntryAvatar";
import { EditIcon, EyeIcon, EyeOffIcon, TrashIcon } from "../../icons";
import { useAsyncAction } from "../../use-async-action";
import { ClipboardCopy } from "../../use-clipboard-copy";
import { EntryWithGroup } from "../../vault-browsing";
import { CopyableFieldRow } from "./CopyableFieldRow";
import { EntryHistory } from "./EntryHistory";
import { EntryMetaCards } from "./EntryMetaCards";
import { TotpCard } from "./TotpCard";

interface EntryDetailProps {
  entryWithGroup: EntryWithGroup;
  /**
   * Resolves `{REF:…}` placeholders, so a linked entry shows, copies, and
   * opens the values it points at. Editing still starts from the stored
   * reference text — the shell hands the form the unresolved entry.
   */
  references: FieldReferences;
  urlOpener: UrlOpener;
  clipboard: ClipboardCopy;
  clipboardClearSeconds: number;
  revealed: boolean;
  onToggleReveal: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onRestoreRevision: (index: number) => Promise<void>;
  onDeleteRevision: (index: number) => Promise<void>;
}

export function EntryDetail({
  entryWithGroup,
  references,
  urlOpener,
  clipboard,
  clipboardClearSeconds,
  revealed,
  onToggleReveal,
  onEdit,
  onDelete,
  onRestoreRevision,
  onDeleteRevision,
}: EntryDetailProps) {
  const { entry: storedEntry, group } = entryWithGroup;
  const entry = useMemo(() => references.resolveEntry(storedEntry), [references, storedEntry]);
  const totpConfig = useMemo(() => totpConfigFromCustomFields(entry.customFields), [entry]);
  // The raw TOTP fields have their own card above; only hide them from the
  // generic list once they've actually been parsed into a usable config, so
  // a malformed field is still visible somewhere rather than disappearing.
  const otherCustomFields = totpConfig
    ? entry.customFields.values.filter((field) => !TOTP_FIELD_KEYS.has(field.key))
    : entry.customFields.values;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const revealLabel = revealed ? "Hide password" : "Show password";

  return (
    <div className="detail-content">
      <div className="detail-header">
        <EntryAvatar entry={entry} size="lg" />
        <div className="entry-row-text">
          <h1 className="detail-title">{entry.title || "(untitled)"}</h1>
          {entry.url && (
            <button
              type="button"
              className="link-muted"
              onClick={() => void urlOpener.open(openableUrl(entry.url))}
            >
              {entry.url}
            </button>
          )}
        </div>
        <div className="detail-header-actions">
          <button type="button" className="icon-button" aria-label="Edit entry" onClick={onEdit}>
            <EditIcon size={18} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Delete entry"
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon size={18} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="group-inline-confirm">
          <span>Delete this entry?</span>
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
            onClick={() => void run(onDelete, "Failed to delete entry.")}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      )}
      {error && <div className="field-error">{error}</div>}

      <div className="detail-cards">
        <div className="detail-card">
          <CopyableFieldRow
            field="username"
            label="Username"
            value={entry.username}
            copyLabel="Copy username"
            copyValue={entry.username}
            clipboard={clipboard}
            clipboardClearSeconds={clipboardClearSeconds}
          />
          <CopyableFieldRow
            field="password"
            label="Password"
            value={revealed ? entry.password.reveal() : entry.password.toString()}
            valueClassName="masked"
            copyLabel="Copy password"
            copyValue={entry.password.reveal()}
            clipboard={clipboard}
            clipboardClearSeconds={clipboardClearSeconds}
            actions={
              <button
                type="button"
                className="icon-button-small"
                aria-label={revealLabel}
                title={revealLabel}
                onClick={onToggleReveal}
              >
                {revealed ? (
                  <EyeOffIcon size={17} strokeWidth={2.25} />
                ) : (
                  <EyeIcon size={17} strokeWidth={2.25} />
                )}
              </button>
            }
          />
        </div>

        {totpConfig && (
          <TotpCard
            config={totpConfig}
            clipboard={clipboard}
            clipboardClearSeconds={clipboardClearSeconds}
          />
        )}

        <EntryMetaCards entry={entry} group={group} customFields={otherCustomFields} />

        {storedEntry.history.length > 0 && (
          <EntryHistory
            entry={storedEntry}
            clipboard={clipboard}
            onRestore={onRestoreRevision}
            onDelete={onDeleteRevision}
          />
        )}
      </div>
    </div>
  );
}
