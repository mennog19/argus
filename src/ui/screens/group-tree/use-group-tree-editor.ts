import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { CustomIcon, Group, GroupId, Icon } from "../../../domain";
import { useAsyncAction } from "../../use-async-action";
import { toggleMember } from "../../toggle-member";
import { Anchor } from "./floating-panel";

export type Editor =
  | { kind: "add"; parentId: GroupId }
  | { kind: "rename"; group: Group }
  | { kind: "delete"; group: Group };

/**
 * The row's overflow menu and icon popover both float over the rest of the
 * app (fixed position, anchored to the trigger that opened them) instead of
 * being laid out inline in the ~200px sidebar column, which is too narrow
 * for either to fit. Only one is ever open at a time.
 */
export type Floating =
  { kind: "menu"; group: Group; anchor: Anchor } | { kind: "icon"; group: Group; anchor: Anchor };

export interface GroupTreeCallbacks {
  onCreateGroup: (parentId: GroupId, name: string) => Promise<void>;
  onRenameGroup: (groupId: GroupId, name: string) => Promise<void>;
  onDeleteGroup: (groupId: GroupId) => Promise<void>;
  onChangeGroupIcon: (groupId: GroupId, icon: Icon, added?: CustomIcon) => Promise<void>;
}

export interface GroupTreeEditor {
  readonly editor: Editor | undefined;
  readonly floating: Floating | undefined;
  readonly floatingRef: RefObject<HTMLDivElement | null>;
  readonly draft: string;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly collapsed: ReadonlySet<string>;
  setDraft(draft: string): void;
  toggleCollapsed(groupId: string): void;
  startAdd(parentId: GroupId): void;
  startRename(group: Group): void;
  startDelete(group: Group): void;
  cancelEditor(): void;
  toggleMenu(group: Group, anchor: Anchor): void;
  /** Swaps the open row menu for the icon popover, anchored at the same spot. */
  openIconPopover(group: Group, anchor: Anchor): void;
  submitAdd(parentId: GroupId): Promise<void>;
  submitRename(group: Group): Promise<void>;
  submitDelete(group: Group): Promise<void>;
  changeIcon(group: Group, icon: Icon, added?: CustomIcon): Promise<void>;
}

/**
 * Everything the sidebar's inline editors and floating panels share. The
 * add/rename/delete editors and the icon popover share one async action: only
 * one of them is ever open at a time.
 */
export function useGroupTreeEditor({
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onChangeGroupIcon,
}: GroupTreeCallbacks): GroupTreeEditor {
  const [editor, setEditor] = useState<Editor | undefined>(undefined);
  const [floating, setFloating] = useState<Floating | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const floatingRef = useRef<HTMLDivElement>(null);
  const { busy, error, run, fail, clearError } = useAsyncAction();

  const dismissFloating = useCallback(() => {
    setFloating(undefined);
    clearError();
  }, [clearError]);

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
      dismissFloating();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissFloating();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [floating, dismissFloating]);

  function openEditor(next: Editor, initialDraft: string) {
    setFloating(undefined);
    setEditor(next);
    setDraft(initialDraft);
    clearError();
  }

  function closeEditor() {
    setEditor(undefined);
    setDraft("");
  }

  /** The editors all close on success and stay open, explaining, on failure. */
  async function submitNamed(save: (name: string) => Promise<void>) {
    const trimmed = draft.trim();
    if (trimmed === "") {
      fail("Group name is required.");
      return;
    }
    if (await run(() => save(trimmed))) {
      closeEditor();
    }
  }

  return {
    editor,
    floating,
    floatingRef,
    draft,
    busy,
    error,
    collapsed,
    setDraft,
    toggleCollapsed: (groupId) => setCollapsed((previous) => toggleMember(previous, groupId)),
    startAdd: (parentId) => openEditor({ kind: "add", parentId }, ""),
    startRename: (group) => openEditor({ kind: "rename", group }, group.name),
    startDelete: (group) => openEditor({ kind: "delete", group }, ""),
    cancelEditor: () => {
      setEditor(undefined);
      clearError();
    },
    toggleMenu: (group, anchor) => {
      if (floating?.kind === "menu" && floating.group.id.equals(group.id)) {
        setFloating(undefined);
        return;
      }
      setFloating({ kind: "menu", group, anchor });
      clearError();
    },
    openIconPopover: (group, anchor) => {
      setFloating({ kind: "icon", group, anchor });
      clearError();
    },
    submitAdd: (parentId) => submitNamed((name) => onCreateGroup(parentId, name)),
    submitRename: (group) => submitNamed((name) => onRenameGroup(group.id, name)),
    submitDelete: async (group) => {
      if (await run(() => onDeleteGroup(group.id))) {
        closeEditor();
      }
    },
    changeIcon: async (group, icon, added) => {
      await run(() => onChangeGroupIcon(group.id, icon, added));
    },
  };
}
