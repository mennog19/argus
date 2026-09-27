import { Group, GroupId, Icon } from "../../domain";
import { GroupDeleteMode } from "../../application/settings";
import { collectAllEntries } from "../vault-browsing";
import { useGroupDragDrop } from "../use-group-drag-drop";
import { PlusIcon, TrashIcon } from "../icons";
import { GroupNameForm } from "./group-tree/GroupNameForm";
import { GroupNode, GroupTreeShared } from "./group-tree/GroupNode";
import { useGroupTreeEditor } from "./group-tree/use-group-tree-editor";

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
  const tree = useGroupTreeEditor({
    onCreateGroup,
    onRenameGroup,
    onDeleteGroup,
    onChangeGroupIcon,
  });
  // Drops report separately: they can fail while an editor is open, and the
  // message belongs at the top of the sidebar rather than inside that editor.
  const drag = useGroupDragDrop({ onDropEntry, onMoveGroupToPosition, onMoveGroupToParent });
  const shared: GroupTreeShared = { tree, drag, selectedGroupId, groupDeleteMode, onSelect };

  const isAddingTopLevel = tree.editor?.kind === "add" && tree.editor.parentId.equals(rootGroup.id);
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
          onClick={() => tree.startAdd(rootGroup.id)}
        >
          <PlusIcon size={14} strokeWidth={2.5} />
        </button>
      </div>

      {isAddingTopLevel && (
        <GroupNameForm
          label="New group name"
          indent={0}
          draft={tree.draft}
          error={tree.error}
          busy={tree.busy}
          onDraftChange={tree.setDraft}
          onSave={() => void tree.submitAdd(rootGroup.id)}
          onCancel={tree.cancelEditor}
        />
      )}
      {drag.error && (
        <div className="group-drop-error" role="alert">
          {drag.error}
        </div>
      )}

      {visibleGroups.map((group) => (
        <GroupNode
          key={group.id.toString()}
          group={group}
          depth={0}
          parentId={rootGroup.id}
          siblings={rootGroup.groups}
          shared={shared}
        />
      ))}

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
