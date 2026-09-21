import { useState } from "react";
import { Group, GroupId } from "../../domain";
import { collectAllEntries } from "../vault-browsing";
import { errorMessage } from "../error-message";
import { ChevronIcon, EditIcon, PlusIcon, TrashIcon } from "../icons";

interface GroupTreeProps {
  rootGroup: Group;
  recycleBin: Group | undefined;
  selectedGroupId: string;
  allItemsId: string;
  allItemsCount: number;
  onSelect: (groupId: string) => void;
  onCreateGroup: (parentId: GroupId, name: string) => Promise<void>;
  onRenameGroup: (groupId: GroupId, name: string) => Promise<void>;
  onDeleteGroup: (groupId: GroupId) => Promise<void>;
}

type Editor =
  | { kind: "add"; parentId: GroupId }
  | { kind: "rename"; group: Group }
  | { kind: "delete"; group: Group };

const INDENT_PX = 14;

export function GroupTree({
  rootGroup,
  recycleBin,
  selectedGroupId,
  allItemsId,
  allItemsCount,
  onSelect,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}: GroupTreeProps) {
  const [editor, setEditor] = useState<Editor | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  function startAdd(parentId: GroupId) {
    setEditor({ kind: "add", parentId });
    setDraft("");
    setError(undefined);
  }

  function startRename(group: Group) {
    setEditor({ kind: "rename", group });
    setDraft(group.name);
    setError(undefined);
  }

  function startDelete(group: Group) {
    setEditor({ kind: "delete", group });
    setError(undefined);
  }

  function cancelEditor() {
    setEditor(undefined);
    setError(undefined);
  }

  async function submitAdd(parentId: GroupId) {
    const name = draft.trim();
    if (name === "") {
      setError("Group name is required.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onCreateGroup(parentId, name);
      setEditor(undefined);
      setDraft("");
    } catch (cause) {
      setError(errorMessage(cause, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  async function submitRename(group: Group) {
    const name = draft.trim();
    if (name === "") {
      setError("Group name is required.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onRenameGroup(group.id, name);
      setEditor(undefined);
      setDraft("");
    } catch (cause) {
      setError(errorMessage(cause, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  async function submitDelete(group: Group) {
    setBusy(true);
    setError(undefined);
    try {
      await onDeleteGroup(group.id);
      setEditor(undefined);
    } catch (cause) {
      setError(errorMessage(cause, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  function toggleCollapsed(groupId: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function renderInlineForm(label: string, onSave: () => void) {
    return (
      <div className="group-inline-form">
        <input
          type="text"
          className="field-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Group name"
          aria-label={label}
          autoFocus
        />
        <button type="button" className="link-muted" onClick={onSave} disabled={busy}>
          Save
        </button>
        <button type="button" className="link-muted" onClick={cancelEditor} disabled={busy}>
          Cancel
        </button>
      </div>
    );
  }

  function renderGroup(group: Group, depth: number) {
    const idStr = group.id.toString();
    const isActive = selectedGroupId === idStr;
    const isCollapsed = collapsed.has(idStr);
    const isRenaming = editor?.kind === "rename" && editor.group.id.equals(group.id);
    const isDeleting = editor?.kind === "delete" && editor.group.id.equals(group.id);
    const isAddingChild = editor?.kind === "add" && editor.parentId.equals(group.id);
    const indent = 10 + depth * INDENT_PX;

    return (
      <div key={idStr} className="group-node">
        {isDeleting ? (
          <div className="group-inline-confirm" style={{ paddingLeft: indent }}>
            <span>Delete &quot;{group.name}&quot;?</span>
            <button
              type="button"
              className="link-muted"
              onClick={() => void submitDelete(group)}
              disabled={busy}
            >
              Delete
            </button>
            <button type="button" className="link-muted" onClick={cancelEditor} disabled={busy}>
              Cancel
            </button>
          </div>
        ) : isRenaming ? (
          <div className="group-inline-form" style={{ paddingLeft: indent }}>
            <input
              type="text"
              className="field-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={`Rename ${group.name}`}
              autoFocus
            />
            <button
              type="button"
              className="link-muted"
              onClick={() => void submitRename(group)}
              disabled={busy}
            >
              Save
            </button>
            <button type="button" className="link-muted" onClick={cancelEditor} disabled={busy}>
              Cancel
            </button>
          </div>
        ) : (
          <div className={`group-row${isActive ? " active" : ""}`} style={{ paddingLeft: indent }}>
            {group.groups.length > 0 && (
              <button
                type="button"
                className="group-disclosure"
                aria-label={isCollapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                onClick={() => toggleCollapsed(idStr)}
              >
                <ChevronIcon size={11} />
              </button>
            )}
            <button type="button" className="group-row-name" onClick={() => onSelect(idStr)}>
              <span>{group.name}</span>
              <span className="sidebar-row-count">{group.entries.length}</span>
            </button>
            <span className="group-row-actions">
              <button
                type="button"
                aria-label={`Add subgroup to ${group.name}`}
                onClick={() => startAdd(group.id)}
              >
                <PlusIcon size={12} />
              </button>
              <button
                type="button"
                aria-label={`Rename ${group.name}`}
                onClick={() => startRename(group)}
              >
                <EditIcon size={12} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${group.name}`}
                onClick={() => startDelete(group)}
              >
                <TrashIcon size={12} />
              </button>
            </span>
          </div>
        )}

        {isAddingChild && renderInlineForm("New group name", () => void submitAdd(group.id))}
        {(isRenaming || isDeleting || isAddingChild) && error && (
          <div className="field-error">{error}</div>
        )}

        {!isCollapsed && group.groups.map((child) => renderGroup(child, depth + 1))}
      </div>
    );
  }

  const isAddingTopLevel = editor?.kind === "add" && editor.parentId.equals(rootGroup.id);
  const visibleGroups = rootGroup.groups.filter(
    (group) => !recycleBin || !group.id.equals(recycleBin.id),
  );

  return (
    <div className="group-sidebar">
      <div className="sidebar-section-label">Vault</div>
      <button
        type="button"
        className={`sidebar-row${selectedGroupId === allItemsId ? " active" : ""}`}
        onClick={() => onSelect(allItemsId)}
      >
        <span>All Items</span>
        <span className="sidebar-row-count">{allItemsCount}</span>
      </button>

      <div className="sidebar-divider" />
      <div className="sidebar-section-header">
        <div className="sidebar-section-label">Groups</div>
        <button
          type="button"
          className="icon-button-small"
          aria-label="Add group"
          onClick={() => startAdd(rootGroup.id)}
        >
          <PlusIcon size={13} />
        </button>
      </div>

      {isAddingTopLevel && renderInlineForm("New group name", () => void submitAdd(rootGroup.id))}
      {isAddingTopLevel && error && <div className="field-error">{error}</div>}

      {visibleGroups.map((group) => renderGroup(group, 0))}

      {recycleBin && (
        <>
          <div className="sidebar-divider" />
          <button
            type="button"
            className={`sidebar-row${selectedGroupId === recycleBin.id.toString() ? " active" : ""}`}
            onClick={() => onSelect(recycleBin.id.toString())}
          >
            <span className="sidebar-row-icon-label">
              <TrashIcon size={13} />
              Recycle Bin
            </span>
            <span className="sidebar-row-count">{collectAllEntries(recycleBin).length}</span>
          </button>
        </>
      )}
    </div>
  );
}
