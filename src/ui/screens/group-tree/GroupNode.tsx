import { Group, GroupId } from "../../../domain";
import { GroupDeleteMode } from "../../../application/settings";
import { GroupAvatar } from "../../entry-icons/EntryAvatar";
import { ChevronIcon, MoreIcon, PlusIcon } from "../../icons";
import { GroupDragDrop } from "../../use-group-drag-drop";
import { anchorOf } from "./floating-panel";
import { GroupDeleteConfirm } from "./GroupDeleteConfirm";
import { GroupIconPopover, GroupRowMenu } from "./GroupFloatingPanels";
import { GroupNameForm } from "./GroupNameForm";
import { GroupTreeEditor } from "./use-group-tree-editor";

const INDENT_PX = 14;
const ROW_INSET_PX = 4;

/** What every node in the tree shares, passed down unchanged through the recursion. */
export interface GroupTreeShared {
  tree: GroupTreeEditor;
  drag: GroupDragDrop;
  selectedGroupId: string;
  groupDeleteMode: GroupDeleteMode;
  onSelect: (groupId: string) => void;
}

interface GroupNodeProps {
  group: Group;
  depth: number;
  parentId: GroupId;
  siblings: readonly Group[];
  shared: GroupTreeShared;
}

export function GroupNode({ group, depth, parentId, siblings, shared }: GroupNodeProps) {
  const { tree, drag, selectedGroupId, groupDeleteMode, onSelect } = shared;
  const { editor, floating } = tree;
  const idStr = group.id.toString();
  const isActive = selectedGroupId === idStr;
  const isCollapsed = tree.collapsed.has(idStr);
  const isRenaming = editor?.kind === "rename" && editor.group.id.equals(group.id);
  const isDeleting = editor?.kind === "delete" && editor.group.id.equals(group.id);
  const isAddingChild = editor?.kind === "add" && editor.parentId.equals(group.id);
  const ownsFloating = floating !== undefined && floating.group.id.equals(group.id);
  const menu = ownsFloating && floating.kind === "menu" ? floating : undefined;
  const iconPopover = ownsFloating && floating.kind === "icon" ? floating : undefined;
  const indent = ROW_INSET_PX + depth * INDENT_PX;

  function nameForm(label: string, formIndent: number, onSave: () => Promise<void>) {
    return (
      <GroupNameForm
        label={label}
        indent={formIndent}
        draft={tree.draft}
        error={tree.error}
        busy={tree.busy}
        onDraftChange={tree.setDraft}
        onSave={() => void onSave()}
        onCancel={tree.cancelEditor}
      />
    );
  }

  return (
    <div className="group-node">
      {isDeleting ? (
        <GroupDeleteConfirm
          groupName={group.name}
          indent={indent - ROW_INSET_PX}
          groupDeleteMode={groupDeleteMode}
          error={tree.error}
          busy={tree.busy}
          onCancel={tree.cancelEditor}
          onConfirm={() => void tree.submitDelete(group)}
        />
      ) : isRenaming ? (
        nameForm(`Rename ${group.name}`, indent - ROW_INSET_PX, () => tree.submitRename(group))
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
              onClick={() => tree.toggleCollapsed(idStr)}
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
              onClick={() => tree.startAdd(group.id)}
            >
              <PlusIcon size={15} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              data-group-menu-trigger
              className={ownsFloating ? "active" : undefined}
              aria-label={`More actions for ${group.name}`}
              aria-haspopup="menu"
              aria-expanded={menu !== undefined}
              title="More actions"
              onClick={(event) => tree.toggleMenu(group, anchorOf(event.currentTarget))}
            >
              <MoreIcon size={15} />
            </button>
          </span>
        </div>
      )}

      {isAddingChild &&
        nameForm("New group name", indent + INDENT_PX - ROW_INSET_PX, () =>
          tree.submitAdd(group.id),
        )}

      {menu && (
        <GroupRowMenu
          anchor={menu.anchor}
          panelRef={tree.floatingRef}
          onChangeIcon={(event) => tree.openIconPopover(group, anchorOf(event.currentTarget))}
          onRename={() => tree.startRename(group)}
          onDelete={() => tree.startDelete(group)}
        />
      )}

      {iconPopover && (
        <GroupIconPopover
          group={group}
          anchor={iconPopover.anchor}
          panelRef={tree.floatingRef}
          error={tree.error}
          onChange={(icon, added) => void tree.changeIcon(group, icon, added)}
        />
      )}

      {!isCollapsed &&
        group.groups.map((child) => (
          <GroupNode
            key={child.id.toString()}
            group={child}
            depth={depth + 1}
            parentId={group.id}
            siblings={group.groups}
            shared={shared}
          />
        ))}
    </div>
  );
}
