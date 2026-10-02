import { DragEvent, useState } from "react";
import { Group, GroupId } from "../domain";
import { ENTRY_DRAG_TYPE } from "./entry-drag";
import { GROUP_DRAG_TYPE } from "./group-drag";
import { useAsyncAction } from "./use-async-action";

/** Which part of a row a dragged group is currently hovering over. */
export type DropZone = "before" | "after" | "into";

/** Which row a dragged group is currently hovering over, and where on it. */
interface ReorderTarget {
  groupId: string;
  edge: DropZone;
}

const MOVE_GROUP_FAILED = "Couldn't move the group.";
const MOVE_ENTRY_FAILED = "Couldn't move the entry.";

export interface GroupDragDropCallbacks {
  onDropEntry: (entryId: string, groupId: GroupId) => Promise<void>;
  onMoveGroupToPosition: (
    groupId: GroupId,
    targetParentId: GroupId,
    beforeId: GroupId | undefined,
  ) => Promise<void>;
  onMoveGroupToParent: (groupId: GroupId, targetGroupId: GroupId) => Promise<void>;
}

/** The drag-related props a group row spreads onto its element. */
export interface GroupRowDragProps {
  draggable: true;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onAnimationEnd: () => void;
}

/** The drag-related props of a row that only takes dropped entries, like "All Items". */
export interface EntryDropProps {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onAnimationEnd: () => void;
}

export interface GroupDragDrop {
  /** Why the last drop didn't happen, shown at the top of the sidebar. */
  readonly error: string | undefined;
  /** The drag-state class names for one row, appended to its own. */
  rowClasses(groupId: string): string;
  /** Everything a row needs to take part in both kinds of drag. */
  rowProps(group: Group, parentId: GroupId, siblings: readonly Group[]): GroupRowDragProps;
  /**
   * What a row that isn't a group itself needs to take dropped entries into
   * `groupId`. `rowClasses` knows it by that same id.
   */
  entryDropProps(groupId: GroupId): EntryDropProps;
}

/**
 * Every group id in `group`'s own subtree, including itself — used to block
 * dropping a group into itself or a descendant.
 */
function collectSubtreeIds(group: Group): ReadonlySet<string> {
  const ids = new Set<string>([group.id.toString()]);
  for (const child of group.groups) {
    for (const id of collectSubtreeIds(child)) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * Resolves the `beforeId` for a drop on `hoveredId`'s given edge, within
 * `siblings` — the full ordered list the hovered group belongs to (root level
 * uses the underlying, unfiltered group list so dropping after the last
 * visible group still lands before a trailing recycle bin rather than past it).
 */
function resolveBeforeId(
  siblings: readonly Group[],
  hoveredId: string,
  edge: "before" | "after",
): GroupId | undefined {
  const index = siblings.findIndex((g) => g.id.toString() === hoveredId);
  return edge === "before" ? siblings[index].id : siblings[index + 1]?.id;
}

/**
 * The top/bottom quarters of a row reorder around it (possibly into a
 * different parent); the middle reparents into it.
 */
function dropZoneFor(event: DragEvent<HTMLDivElement>): DropZone {
  const rect = event.currentTarget.getBoundingClientRect();
  const relativeY = event.clientY - rect.top;
  if (relativeY < rect.height * 0.25) {
    return "before";
  }
  if (relativeY > rect.height * 0.75) {
    return "after";
  }
  return "into";
}

/**
 * Both drags the group sidebar accepts: an entry dropped onto a group, and a
 * group dragged among (or into) other groups.
 */
export function useGroupDragDrop(callbacks: GroupDragDropCallbacks): GroupDragDrop {
  const { onDropEntry, onMoveGroupToPosition, onMoveGroupToParent } = callbacks;
  const drop = useAsyncAction();
  const [entryDropTargetId, setEntryDropTargetId] = useState<string | undefined>(undefined);
  const [flashId, setFlashId] = useState<string | undefined>(undefined);
  const [draggingGroupId, setDraggingGroupId] = useState<string | undefined>(undefined);
  const [draggingSubtreeIds, setDraggingSubtreeIds] = useState<ReadonlySet<string>>(new Set());
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget | undefined>(undefined);

  function entryDragOver(event: DragEvent<HTMLElement>, groupId: string) {
    if (!event.dataTransfer.types.includes(ENTRY_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setEntryDropTargetId(groupId);
  }

  function entryDragLeave(event: DragEvent<HTMLElement>, groupId: string) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setEntryDropTargetId((current) => (current === groupId ? undefined : current));
  }

  async function entryDrop(event: DragEvent<HTMLElement>, groupId: GroupId) {
    if (!event.dataTransfer.types.includes(ENTRY_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    setEntryDropTargetId(undefined);
    const entryId = event.dataTransfer.getData(ENTRY_DRAG_TYPE);
    if (await drop.run(() => onDropEntry(entryId, groupId), MOVE_ENTRY_FAILED)) {
      setFlashId(groupId.toString());
    }
  }

  function groupDragStart(event: DragEvent<HTMLDivElement>, group: Group) {
    event.dataTransfer.setData(GROUP_DRAG_TYPE, group.id.toString());
    event.dataTransfer.effectAllowed = "move";
    setDraggingGroupId(group.id.toString());
    setDraggingSubtreeIds(collectSubtreeIds(group));
  }

  function groupDragEnd() {
    setDraggingGroupId(undefined);
    setDraggingSubtreeIds(new Set());
    setReorderTarget(undefined);
  }

  /**
   * Shows a reorder or reparent indicator for any hovered row that isn't the
   * dragged group's own subtree (dropping into itself or a descendant would
   * create a cycle) — the top/bottom quarters target the hovered row's own
   * level (which may differ from the dragged group's current parent), the
   * middle targets becoming a child of the hovered row itself.
   */
  function groupDragOver(event: DragEvent<HTMLDivElement>, group: Group) {
    if (!event.dataTransfer.types.includes(GROUP_DRAG_TYPE)) {
      return;
    }
    const groupId = group.id.toString();
    if (!draggingGroupId || draggingSubtreeIds.has(groupId)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setReorderTarget({ groupId, edge: dropZoneFor(event) });
  }

  function groupDragLeave(event: DragEvent<HTMLDivElement>, groupId: string) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setReorderTarget((current) => (current?.groupId === groupId ? undefined : current));
  }

  async function groupDrop(
    event: DragEvent<HTMLDivElement>,
    group: Group,
    parentId: GroupId,
    siblings: readonly Group[],
  ) {
    if (!event.dataTransfer.types.includes(GROUP_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    setReorderTarget(undefined);
    const groupIdStr = group.id.toString();
    const draggedIdStr = event.dataTransfer.getData(GROUP_DRAG_TYPE);
    if (!draggedIdStr || draggingSubtreeIds.has(groupIdStr)) {
      return;
    }
    const dragged = GroupId.fromString(draggedIdStr);
    const zone = dropZoneFor(event);
    if (zone === "into") {
      if (await drop.run(() => onMoveGroupToParent(dragged, group.id), MOVE_GROUP_FAILED)) {
        setFlashId(groupIdStr);
      }
      return;
    }
    const beforeId = resolveBeforeId(siblings, groupIdStr, zone);
    await drop.run(() => onMoveGroupToPosition(dragged, parentId, beforeId), MOVE_GROUP_FAILED);
  }

  return {
    error: drop.error,

    rowClasses(groupId: string): string {
      return [
        entryDropTargetId === groupId ? " drop-target" : "",
        flashId === groupId ? " drop-flash" : "",
        draggingGroupId === groupId ? " dragging" : "",
        reorderTarget?.groupId === groupId ? ` reorder-${reorderTarget.edge}` : "",
      ].join("");
    },

    rowProps(group: Group, parentId: GroupId, siblings: readonly Group[]): GroupRowDragProps {
      const groupId = group.id.toString();
      // A row accepts both kinds of drag, and each handler ignores events
      // carrying the other's payload, so both run on every event.
      return {
        draggable: true,
        onDragStart: (event) => groupDragStart(event, group),
        onDragEnd: groupDragEnd,
        onDragEnter: (event) => {
          entryDragOver(event, groupId);
          groupDragOver(event, group);
        },
        onDragOver: (event) => {
          entryDragOver(event, groupId);
          groupDragOver(event, group);
        },
        onDragLeave: (event) => {
          entryDragLeave(event, groupId);
          groupDragLeave(event, groupId);
        },
        onDrop: (event) => {
          void entryDrop(event, group.id);
          void groupDrop(event, group, parentId, siblings);
        },
        onAnimationEnd: () => setFlashId(undefined),
      };
    },

    entryDropProps(groupId: GroupId): EntryDropProps {
      const id = groupId.toString();
      return {
        onDragEnter: (event) => entryDragOver(event, id),
        onDragOver: (event) => entryDragOver(event, id),
        onDragLeave: (event) => entryDragLeave(event, id),
        onDrop: (event) => void entryDrop(event, groupId),
        onAnimationEnd: () => setFlashId(undefined),
      };
    },
  };
}
