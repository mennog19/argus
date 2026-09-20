import { useState } from "react";
import { Entry, EntryId, Group, GroupId, Vault } from "../../domain";
import { UrlOpener } from "../../application/url-opener";
import { EditIcon, LockIcon, PlusIcon, TrashIcon } from "../icons";
import { initialOf } from "../format";
import { collectAllEntries, entriesOf, EntryWithGroup, flattenGroupOptions } from "../vault-browsing";
import { EntryForm } from "./EntryForm";
import { GroupTree } from "./GroupTree";

interface VaultShellProps {
  vault: Vault;
  urlOpener: UrlOpener;
  onLock: () => void;
  onSave: (vault: Vault) => Promise<void>;
}

const ALL_ITEMS = "__all__";

type FormMode = { kind: "none" } | { kind: "create" } | { kind: "edit" };

export function VaultShell({ vault, urlOpener, onLock, onSave }: VaultShellProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_ITEMS);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "none" });

  const rootGroup = vault.rootGroup;

  // Falls back to "All Items" if the selected group no longer exists (e.g.
  // it, or an ancestor of it, was just deleted).
  const effectiveGroupId =
    selectedGroupId === ALL_ITEMS || vault.findGroup(GroupId.fromString(selectedGroupId))
      ? selectedGroupId
      : ALL_ITEMS;
  const selectedGroup =
    effectiveGroupId === ALL_ITEMS ? undefined : vault.findGroup(GroupId.fromString(effectiveGroupId));

  const visibleEntries: EntryWithGroup[] =
    effectiveGroupId === ALL_ITEMS ? collectAllEntries(rootGroup) : entriesOf(selectedGroup!);

  const selected = visibleEntries.find((item) => item.entry.id.toString() === selectedEntryId);
  const groupOptions = flattenGroupOptions(rootGroup);

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setSelectedEntryId(undefined);
    setRevealed(false);
    setFormMode({ kind: "none" });
  }

  function selectEntry(entryId: string) {
    setSelectedEntryId(entryId);
    setRevealed(false);
    setFormMode({ kind: "none" });
  }

  async function persist(nextVault: Vault): Promise<void> {
    await onSave(nextVault);
  }

  async function handleCreateGroup(parentId: GroupId, name: string) {
    await persist(vault.addGroup(parentId, Group.create(name)));
  }

  async function handleRenameGroup(groupId: GroupId, name: string) {
    await persist(vault.renameGroup(groupId, name));
  }

  async function handleDeleteGroup(groupId: GroupId) {
    await persist(vault.removeGroup(groupId));
    if (effectiveGroupId === groupId.toString()) {
      selectGroup(ALL_ITEMS);
    }
  }

  async function handleCreateEntry(entry: Entry, groupId: GroupId) {
    await persist(vault.addEntry(groupId, entry));
    setFormMode({ kind: "none" });
    setSelectedEntryId(entry.id.toString());
  }

  async function handleUpdateEntry(entry: Entry, targetGroupId: GroupId, currentGroupId: GroupId) {
    let next = vault.updateEntry(entry);
    if (!currentGroupId.equals(targetGroupId)) {
      next = next.removeEntry(entry.id).addEntry(targetGroupId, entry);
    }
    await persist(next);
    setFormMode({ kind: "none" });
  }

  async function handleDeleteEntry(entryId: EntryId) {
    await persist(vault.removeEntry(entryId));
    setSelectedEntryId(undefined);
  }

  function startCreateEntry() {
    setSelectedEntryId(undefined);
    setFormMode({ kind: "create" });
  }

  const newEntryGroupId = effectiveGroupId === ALL_ITEMS ? rootGroup.id.toString() : effectiveGroupId;

  return (
    <div className="vault-shell">
      <nav className="nav-rail">
        <div className="nav-logo">A</div>
        <button type="button" className="icon-button" onClick={onLock} aria-label="Lock vault">
          <LockIcon />
        </button>
      </nav>

      <GroupTree
        rootGroup={rootGroup}
        selectedGroupId={effectiveGroupId}
        allItemsId={ALL_ITEMS}
        allItemsCount={collectAllEntries(rootGroup).length}
        onSelect={selectGroup}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
      />

      <div className="entry-list-panel">
        <div className="entry-list-header">
          <h2>{effectiveGroupId === ALL_ITEMS ? "All Items" : selectedGroup?.name}</h2>
          <button type="button" className="btn-secondary" onClick={startCreateEntry}>
            <PlusIcon size={13} /> New Entry
          </button>
        </div>
        <div className="entry-list">
          {visibleEntries.length === 0 && (
            <div className="entry-list-empty">No entries in this group.</div>
          )}
          {visibleEntries.map(({ entry }) => (
            <button
              key={entry.id.toString()}
              type="button"
              className={`entry-row${entry.id.toString() === selectedEntryId ? " active" : ""}`}
              onClick={() => selectEntry(entry.id.toString())}
            >
              <div className="entry-avatar">{initialOf(entry.title)}</div>
              <div className="entry-row-text">
                <div className="entry-row-title">{entry.title || "(untitled)"}</div>
                <div className="entry-row-username">{entry.username}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="detail-pane">
        {formMode.kind === "create" && (
          <EntryForm
            initialGroupId={newEntryGroupId}
            groupOptions={groupOptions}
            onSubmit={handleCreateEntry}
            onCancel={() => setFormMode({ kind: "none" })}
          />
        )}
        {formMode.kind === "edit" && selected && (
          <EntryForm
            initialEntry={selected.entry}
            initialGroupId={selected.group.id.toString()}
            groupOptions={groupOptions}
            onSubmit={(entry, groupId) => handleUpdateEntry(entry, groupId, selected.group.id)}
            onCancel={() => setFormMode({ kind: "none" })}
          />
        )}
        {formMode.kind === "none" && !selected && (
          <div className="detail-empty">Select an entry to view details</div>
        )}
        {formMode.kind === "none" && selected && (
          <EntryDetail
            entryWithGroup={selected}
            urlOpener={urlOpener}
            revealed={revealed}
            onToggleReveal={() => setRevealed((value) => !value)}
            onEdit={() => setFormMode({ kind: "edit" })}
            onDelete={() => handleDeleteEntry(selected.entry.id)}
          />
        )}
      </div>
    </div>
  );
}

interface EntryDetailProps {
  entryWithGroup: EntryWithGroup;
  urlOpener: UrlOpener;
  revealed: boolean;
  onToggleReveal: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

function EntryDetail({ entryWithGroup, urlOpener, revealed, onToggleReveal, onEdit, onDelete }: EntryDetailProps) {
  const { entry, group } = entryWithGroup;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleConfirmDelete() {
    setBusy(true);
    setError(undefined);
    try {
      await onDelete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete entry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail-content">
      <div className="detail-header">
        <div className="detail-avatar">{initialOf(entry.title)}</div>
        <div className="entry-row-text">
          <h1 className="detail-title">{entry.title || "(untitled)"}</h1>
          {entry.url && (
            <button type="button" className="link-muted" onClick={() => void urlOpener.open(entry.url)}>
              {entry.url}
            </button>
          )}
        </div>
        <div className="detail-header-actions">
          <button type="button" className="icon-button" aria-label="Edit entry" onClick={onEdit}>
            <EditIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Delete entry"
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="group-inline-confirm">
          <span>Delete this entry?</span>
          <button type="button" className="link-muted" onClick={() => void handleConfirmDelete()} disabled={busy}>
            Delete
          </button>
          <button type="button" className="link-muted" onClick={() => setConfirmingDelete(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
      {error && <div className="field-error">{error}</div>}

      <div className="detail-cards">
        <div className="detail-card">
          <div className="detail-field-row">
            <div>
              <div className="field-label">Username</div>
              <div className="detail-field-value">{entry.username}</div>
            </div>
          </div>
          <div className="detail-field-row">
            <div>
              <div className="field-label">Password</div>
              <div className="detail-field-value masked">
                {revealed ? entry.password.reveal() : entry.password.toString()}
              </div>
            </div>
            <button type="button" onClick={onToggleReveal}>
              {revealed ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="detail-card padded">
          <div className="detail-meta-row">
            <span>Group</span>
            <span>{group.name}</span>
          </div>
        </div>

        {entry.notes && (
          <div className="detail-card padded">
            <div className="field-label">Notes</div>
            <div className="detail-notes">{entry.notes}</div>
          </div>
        )}

        {entry.tags.values.length > 0 && (
          <div className="detail-card padded">
            <div className="field-label">Tags</div>
            <div className="tag-chips">
              {entry.tags.values.map((tag) => (
                <span key={tag.toString()} className="tag-chip">
                  {tag.toString()}
                </span>
              ))}
            </div>
          </div>
        )}

        {entry.customFields.values.length > 0 && (
          <div className="detail-card padded">
            <div className="field-label">Custom fields</div>
            {entry.customFields.values.map((field) => (
              <div className="detail-meta-row" key={field.key}>
                <span>{field.key}</span>
                <span>{field.isProtected ? "••••••••" : field.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
