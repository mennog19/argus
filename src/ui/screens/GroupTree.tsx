import { CSSProperties, MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { Group, GroupId, Icon } from "../../domain";
import { GroupDeleteMode } from "../../application/settings";
import { collectAllEntries } from "../vault-browsing";
import { GroupAvatar } from "../entry-icons/EntryAvatar";
import { IconPicker } from "../entry-icons/IconPicker";
import { useAsyncAction } from "../use-async-action";
import { useGroupDragDrop } from "../use-group-drag-drop";
import { ChevronIcon, EditIcon, MoreIcon, PaletteIcon, PlusIcon, TrashIcon } from "../icons";

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
  onChangeGroupIcon: (groupId: GroupId, icon: Icon) => Promise<void>;
  /** Only used to tell the user, while confirming a delete, what happens to the group's contents. */
  groupDeleteMode: GroupDeleteMode;
  /** True while an entry from the list is being dragged, so groups can show they accept drops. */
  entryDragActive: boolean;
  onDropEntry: (entryId: string, groupId: GroupId) => Promise<void>;
  /**
   * Reparents `groupId` into `targetParentId`, positioned before `beforeId`
   * among its new siblings, or at the end when `beforeId` is undefined.
   * `targetParentId` may be the group's current parent (a plain reorder) or
   * a different one (drag it in or out of a level in the same drop).
   */
  onMoveGroupToPosition: (
    groupId: GroupId,
    targetParentId: GroupId,
    beforeId: GroupId | undefined,
  ) => Promise<void>;
  /** Reparents `groupId` to become the last child of `targetGroupId`. */
  onMoveGroupToParent: (groupId: GroupId, targetGroupId: GroupId) => Promise<void>;
}

/** Where a floating panel's trigger button sat, in viewport coordinates, when it was opened. */
interface Anchor {
  top: number;
  left: number;
  bottom: number;
}

type Editor =
  | { kind: "add"; parentId: GroupId }
  | { kind: "rename"; group: Group }
  | { kind: "delete"; group: Group };

/**
 * The row's overflow menu and icon popover both float over the rest of the
 * app (fixed position, anchored to the trigger that opened them) instead of
 * being laid out inline in the ~200px sidebar column, which is too narrow
 * for either to fit. Only one is ever open at a time.
 */
type Floating =
  { kind: "menu"; group: Group; anchor: Anchor } | { kind: "icon"; group: Group; anchor: Anchor };

const INDENT_PX = 14;
const ROW_INSET_PX = 4;

const FLOATING_GUTTER = 12;
const ROW_MENU_WIDTH = 176;
const ICON_POPOVER_WIDTH = 300;

function floatingStyle(anchor: Anchor, width: number): CSSProperties {
  const maxLeft = window.innerWidth - width - FLOATING_GUTTER;
  return {
    left: Math.max(FLOATING_GUTTER, Math.min(anchor.left, maxLeft)),
    top: anchor.bottom + 6,
  };
}

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
  onChangeGroupIcon,
  groupDeleteMode,
  entryDragActive,
  onDropEntry,
  onMoveGroupToPosition,
  onMoveGroupToParent,
}: GroupTreeProps) {
  const [editor, setEditor] = useState<Editor | undefined>(undefined);
  const [floating, setFloating] = useState<Floating | undefined>(undefined);
  const [draft, setDraft] = useState("");
  // The inline editors (add/rename/delete) and the icon popover share one
  // action: only one of them is ever open at a time.
  const { busy, error, run, fail, clearError } = useAsyncAction();
  // Drops report separately: they can fail while an editor is open, and the
  // message belongs at the top of the sidebar rather than inside that editor.
  const drag = useGroupDragDrop({ onDropEntry, onMoveGroupToPosition, onMoveGroupToParent });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const floatingRef = useRef<HTMLDivElement>(null);

  // Closes the open menu/popover on an outside click or Escape, but not on a
  // click that lands on a trigger button — that button's own click handler
  // decides whether that's opening a different group's panel or toggling
  // this one shut.
  useEffect(() => {
    if (!floating) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (floatingRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest("[data-group-menu-trigger]")) {
        return;
      }
      setFloating(undefined);
      clearError();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFloating(undefined);
        clearError();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [floating, clearError]);

  function startAdd(parentId: GroupId) {
    setEditor({ kind: "add", parentId });
    setDraft("");
    clearError();
  }

  function startRename(group: Group) {
    setEditor({ kind: "rename", group });
    setDraft(group.name);
    clearError();
  }

  function startDelete(group: Group) {
    setEditor({ kind: "delete", group });
    clearError();
  }

  function toggleMenu(group: Group, event: ReactMouseEvent<HTMLButtonElement>) {
    if (floating?.kind === "menu" && floating.group.id.equals(group.id)) {
      setFloating(undefined);
      return;
    }
    const { top, left, bottom } = event.currentTarget.getBoundingClientRect();
    setFloating({ kind: "menu", group, anchor: { top, left, bottom } });
    clearError();
  }

  /** Swaps the open row menu for the icon popover, anchored at the same spot. */
  function openIconPopover(group: Group, event: ReactMouseEvent<HTMLButtonElement>) {
    const { top, left, bottom } = event.currentTarget.getBoundingClientRect();
    setFloating({ kind: "icon", group, anchor: { top, left, bottom } });
    clearError();
  }

  function cancelEditor() {
    setEditor(undefined);
    clearError();
  }

  async function changeIcon(group: Group, icon: Icon) {
    await run(() => onChangeGroupIcon(group.id, icon));
  }

  /** The editors all close on success and stay open, explaining, on failure. */
  async function submitNamed(name: string, save: (name: string) => Promise<void>) {
    const trimmed = name.trim();
    if (trimmed === "") {
      fail("Group name is required.");
      return;
    }
    if (await run(() => save(trimmed))) {
      setEditor(undefined);
      setDraft("");
    }
  }

  async function submitAdd(parentId: GroupId) {
    await submitNamed(draft, (name) => onCreateGroup(parentId, name));
  }

  async function submitRename(group: Group) {
    await submitNamed(draft, (name) => onRenameGroup(group.id, name));
  }

  async function submitDelete(group: Group) {
    if (await run(() => onDeleteGroup(group.id))) {
      setEditor(undefined);
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

  function renderInlineForm(label: string, indent: number, onSave: () => void) {
    return (
      <form
        className="group-composer"
        style={{ marginLeft: indent }}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <input
          type="text"
          className="group-composer-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              cancelEditor();
            }
          }}
          placeholder="Group name"
          aria-label={label}
          aria-invalid={error !== undefined}
          autoFocus
        />
        {error && <div className="group-composer-error">{error}</div>}
        <div className="group-composer-actions">
          <button
            type="button"
            className="group-composer-cancel"
            onClick={cancelEditor}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className="group-composer-save" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    );
  }

  function renderGroup(group: Group, depth: number, parentId: GroupId, siblings: readonly Group[]) {
    const idStr = group.id.toString();
    const isActive = selectedGroupId === idStr;
    const isCollapsed = collapsed.has(idStr);
    const isRenaming = editor?.kind === "rename" && editor.group.id.equals(group.id);
    const isDeleting = editor?.kind === "delete" && editor.group.id.equals(group.id);
    const isAddingChild = editor?.kind === "add" && editor.parentId.equals(group.id);
    const menu =
      floating?.kind === "menu" && floating.group.id.equals(group.id) ? floating : undefined;
    const iconPopover =
      floating?.kind === "icon" && floating.group.id.equals(group.id) ? floating : undefined;
    const indent = ROW_INSET_PX + depth * INDENT_PX;

    return (
      <div key={idStr} className="group-node">
        {isDeleting ? (
          <div
            className="group-composer group-composer-danger"
            style={{ marginLeft: indent - ROW_INSET_PX }}
          >
            <span className="group-composer-title">Delete &quot;{group.name}&quot;?</span>
            <span className="group-composer-hint">
              {groupDeleteMode === "keepContents"
                ? "Its entries and subgroups will move to the parent group."
                : "Its entries and subgroups will be deleted too."}
            </span>
            {error && <div className="group-composer-error">{error}</div>}
            <div className="group-composer-actions">
              <button
                type="button"
                className="group-composer-cancel"
                onClick={cancelEditor}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="group-composer-delete"
                onClick={() => void submitDelete(group)}
                disabled={busy}
              >
                Delete
              </button>
            </div>
          </div>
        ) : isRenaming ? (
          renderInlineForm(
            `Rename ${group.name}`,
            indent - ROW_INSET_PX,
            () => void submitRename(group),
          )
        ) : (
          <div
            className={`group-row${isActive ? " active" : ""}${drag.rowClasses(idStr)}`}
            style={{ paddingLeft: indent }}
            {...drag.rowProps(group, parentId, siblings)}
          >
            {group.groups.length > 0 ? (
              <button
                type="button"
                className={`group-disclosure${isCollapsed ? "" : " expanded"}`}
                aria-label={isCollapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                aria-expanded={!isCollapsed}
                onClick={() => toggleCollapsed(idStr)}
              >
                <ChevronIcon size={12} />
              </button>
            ) : (
              <span className="group-disclosure-spacer" />
            )}
            <button type="button" className="group-row-name" onClick={() => onSelect(idStr)}>
              <GroupAvatar name={group.name} icon={group.icon} size="xs" />
              <span className="group-row-label">{group.name}</span>
              <span className="group-row-count">{group.entries.length}</span>
            </button>
            <span className="group-row-actions">
              <button
                type="button"
                aria-label={`Add subgroup to ${group.name}`}
                title="New subgroup"
                onClick={() => startAdd(group.id)}
              >
                <PlusIcon size={15} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                data-group-menu-trigger
                className={menu || iconPopover ? "active" : undefined}
                aria-label={`More actions for ${group.name}`}
                aria-haspopup="menu"
                aria-expanded={menu !== undefined}
                title="More actions"
                onClick={(event) => toggleMenu(group, event)}
              >
                <MoreIcon size={15} />
              </button>
            </span>
          </div>
        )}

        {isAddingChild &&
          renderInlineForm(
            "New group name",
            indent + INDENT_PX - ROW_INSET_PX,
            () => void submitAdd(group.id),
          )}

        {menu && (
          <div
            ref={floatingRef}
            className="group-row-menu"
            style={floatingStyle(menu.anchor, ROW_MENU_WIDTH)}
          >
            <button type="button" onClick={(event) => openIconPopover(group, event)}>
              <PaletteIcon size={14} />
              Change icon
            </button>
            <button
              type="button"
              onClick={() => {
                setFloating(undefined);
                startRename(group);
              }}
            >
              <EditIcon size={14} />
              Rename
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setFloating(undefined);
                startDelete(group);
              }}
            >
              <TrashIcon size={14} />
              Delete
            </button>
          </div>
        )}

        {iconPopover && (
          <div
            ref={floatingRef}
            className="group-icon-popover"
            style={floatingStyle(iconPopover.anchor, ICON_POPOVER_WIDTH)}
          >
            <IconPicker
              value={group.icon}
              title={group.name}
              url=""
              initiallyOpen
              onChange={(icon) => void changeIcon(group, icon)}
            />
            {error && <div className="group-composer-error">{error}</div>}
          </div>
        )}

        {!isCollapsed &&
          group.groups.map((child) => renderGroup(child, depth + 1, group.id, group.groups))}
      </div>
    );
  }

  const isAddingTopLevel = editor?.kind === "add" && editor.parentId.equals(rootGroup.id);
  const visibleGroups = rootGroup.groups.filter(
    (group) => !recycleBin || !group.id.equals(recycleBin.id),
  );

  return (
    <div className={`group-sidebar${entryDragActive ? " entry-drag-active" : ""}`}>
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
          className={`group-add-button${isAddingTopLevel ? " active" : ""}`}
          aria-label="Add group"
          title="New group"
          onClick={() => startAdd(rootGroup.id)}
        >
          <PlusIcon size={14} strokeWidth={2.5} />
        </button>
      </div>

      {isAddingTopLevel &&
        renderInlineForm("New group name", 0, () => void submitAdd(rootGroup.id))}
      {drag.error && (
        <div className="group-drop-error" role="alert">
          {drag.error}
        </div>
      )}

      {visibleGroups.map((group) => renderGroup(group, 0, rootGroup.id, rootGroup.groups))}

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
