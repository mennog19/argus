import { useState } from "react";
import { EntryId, Group, GroupId } from "../../domain";
import { collectAllEntries } from "../vault-browsing";
import { errorMessage } from "../error-message";
import { EntryAvatar } from "../entry-icons/EntryAvatar";

interface RecycleBinPanelProps {
  binGroup: Group;
  onRestoreEntry: (entryId: EntryId) => Promise<void>;
  onDeleteEntryForever: (entryId: EntryId) => Promise<void>;
  onRestoreGroup: (groupId: GroupId) => Promise<void>;
  onDeleteGroupForever: (groupId: GroupId) => Promise<void>;
  onEmptyRecycleBin: () => Promise<void>;
}

type PendingAction =
  | { kind: "deleteEntryForever"; entryId: EntryId }
  | { kind: "deleteGroupForever"; groupId: GroupId }
  | { kind: "empty" };

export function RecycleBinPanel({
  binGroup,
  onRestoreEntry,
  onDeleteEntryForever,
  onRestoreGroup,
  onDeleteGroupForever,
  onEmptyRecycleBin,
}: RecycleBinPanelProps) {
  const [pending, setPending] = useState<PendingAction | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const deletedGroups = binGroup.groups;
  const deletedEntries = collectAllEntries(binGroup);
  const isEmpty = deletedGroups.length === 0 && deletedEntries.length === 0;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      setPending(undefined);
    } catch (cause) {
      setError(errorMessage(cause, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="recycle-bin-panel">
      <div className="entry-list-header">
        <h2>Recycle Bin</h2>
        <button
          type="button"
          className="btn-secondary"
          disabled={isEmpty}
          onClick={() => setPending({ kind: "empty" })}
        >
          Empty Recycle Bin
        </button>
      </div>

      <div className="recycle-bin-content">
        {pending?.kind === "empty" && (
          <div className="group-inline-confirm">
            <span>Permanently delete everything in the recycle bin?</span>
            <button
              type="button"
              className="link-muted"
              disabled={busy}
              onClick={() => void run(onEmptyRecycleBin)}
            >
              Empty
            </button>
            <button
              type="button"
              className="link-muted"
              disabled={busy}
              onClick={() => setPending(undefined)}
            >
              Cancel
            </button>
          </div>
        )}
        {error && <div className="field-error">{error}</div>}

        {isEmpty && <div className="entry-list-empty">The recycle bin is empty.</div>}

        {deletedGroups.length > 0 && (
          <div className="recycle-bin-section">
            <div className="sidebar-section-label">Deleted Groups</div>
            {deletedGroups.map((group) => (
              <div key={group.id.toString()} className="recycle-row">
                {pending?.kind === "deleteGroupForever" && pending.groupId.equals(group.id) ? (
                  <div className="group-inline-confirm">
                    <span>Permanently delete &quot;{group.name}&quot;?</span>
                    <button
                      type="button"
                      className="link-muted"
                      disabled={busy}
                      onClick={() => void run(() => onDeleteGroupForever(group.id))}
                    >
                      Delete Forever
                    </button>
                    <button
                      type="button"
                      className="link-muted"
                      disabled={busy}
                      onClick={() => setPending(undefined)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="recycle-row-name">{group.name}</span>
                    <span className="recycle-row-actions">
                      <button
                        type="button"
                        className="link-muted"
                        onClick={() => void run(() => onRestoreGroup(group.id))}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="link-muted"
                        onClick={() =>
                          setPending({ kind: "deleteGroupForever", groupId: group.id })
                        }
                      >
                        Delete Forever
                      </button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {deletedEntries.length > 0 && (
          <div className="recycle-bin-section">
            <div className="sidebar-section-label">Deleted Entries</div>
            {deletedEntries.map(({ entry }) => (
              <div key={entry.id.toString()} className="recycle-row">
                {pending?.kind === "deleteEntryForever" && pending.entryId.equals(entry.id) ? (
                  <div className="group-inline-confirm">
                    <span>Permanently delete &quot;{entry.title || "(untitled)"}&quot;?</span>
                    <button
                      type="button"
                      className="link-muted"
                      disabled={busy}
                      onClick={() => void run(() => onDeleteEntryForever(entry.id))}
                    >
                      Delete Forever
                    </button>
                    <button
                      type="button"
                      className="link-muted"
                      disabled={busy}
                      onClick={() => setPending(undefined)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <EntryAvatar entry={entry} />
                    <div className="entry-row-text">
                      <div className="entry-row-title">{entry.title || "(untitled)"}</div>
                      <div className="entry-row-username">{entry.username}</div>
                    </div>
                    <span className="recycle-row-actions">
                      <button
                        type="button"
                        className="link-muted"
                        onClick={() => void run(() => onRestoreEntry(entry.id))}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="link-muted"
                        onClick={() =>
                          setPending({ kind: "deleteEntryForever", entryId: entry.id })
                        }
                      >
                        Delete Forever
                      </button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
