import { describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, Group, Icon } from "../../../src/domain";
import { GroupTree } from "../../../src/ui/screens/GroupTree";
import { ENTRY_DRAG_TYPE } from "../../../src/ui/entry-drag";
import { GROUP_DRAG_TYPE } from "../../../src/ui/group-drag";

function buildTree() {
  const nested = Group.create("Nested");
  const work = Group.create("Work").addGroup(nested);
  const personal = Group.create("Personal");
  const root = Group.create("Root").addGroup(work).addGroup(personal);
  return { root, work, nested, personal };
}

// The row-select button's accessible name is its name text concatenated
// directly with its entry count (e.g. "Work0"), which collides on a loose
// match with the row's own "Add subgroup to Work"/"More actions for Work"
// action buttons — anchor the match to the start of the name to pick out
// just the row button.
function rowButton(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}`, "i") });
}

// Rename/Delete/Change icon all live behind the row's "More actions" menu.
async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `More actions for ${name}` }));
}

function baseProps(root: Group, overrides: Partial<Parameters<typeof GroupTree>[0]> = {}) {
  return {
    rootGroup: root,
    recycleBin: undefined,
    selectedGroupId: "__all__",
    allItemsId: "__all__",
    allItemsCount: 0,
    onSelect: vi.fn(),
    onCreateGroup: vi.fn().mockResolvedValue(undefined),
    onRenameGroup: vi.fn().mockResolvedValue(undefined),
    onDeleteGroup: vi.fn().mockResolvedValue(undefined),
    onChangeGroupIcon: vi.fn().mockResolvedValue(undefined),
    groupDeleteMode: "deleteContents" as const,
    entryDragActive: false,
    onDropEntry: vi.fn().mockResolvedValue(undefined),
    onMoveGroupToPosition: vi.fn().mockResolvedValue(undefined),
    onMoveGroupToParent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("GroupTree", () => {
  it("shows the Groups section and an Add group button even with no groups", () => {
    const root = Group.create("Root");

    render(<GroupTree {...baseProps(root)} />);

    expect(screen.getByText("Groups")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add group" })).toBeInTheDocument();
  });

  it("renders 'All Items' with the given count, active when selected", () => {
    const { root } = buildTree();

    render(<GroupTree {...baseProps(root, { allItemsCount: 5, selectedGroupId: "__all__" })} />);

    const allItems = screen.getByRole("button", { name: /all items/i });
    expect(allItems).toHaveTextContent("5");
    expect(allItems.className).toContain("active");
  });

  it("renders nested groups indented, with a disclosure toggle only on groups that have children", () => {
    const { root, work } = buildTree();

    render(<GroupTree {...baseProps(root)} />);

    expect(rowButton("Work")).toBeInTheDocument();
    expect(rowButton("Nested")).toBeInTheDocument();
    expect(rowButton("Personal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Collapse ${work.name}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /collapse Personal/i })).not.toBeInTheDocument();
  });

  it("calls onSelect with the group's id when a group row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { root, work } = buildTree();

    render(<GroupTree {...baseProps(root, { onSelect })} />);

    await user.click(rowButton("Work"));

    expect(onSelect).toHaveBeenCalledWith(work.id.toString());
  });

  it("marks the selected group's row active", () => {
    const { root, work } = buildTree();

    render(<GroupTree {...baseProps(root, { selectedGroupId: work.id.toString() })} />);

    expect(rowButton("Work").parentElement?.className).toContain("active");
  });

  it("collapses and re-expands a group's children", async () => {
    const user = userEvent.setup();
    const { root, work } = buildTree();

    render(<GroupTree {...baseProps(root)} />);

    expect(rowButton("Nested")).toBeInTheDocument();

    const collapse = screen.getByRole("button", { name: `Collapse ${work.name}` });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    await user.click(collapse);
    expect(screen.queryByRole("button", { name: /^nested/i })).not.toBeInTheDocument();

    const expand = screen.getByRole("button", { name: `Expand ${work.name}` });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    await user.click(expand);
    expect(rowButton("Nested")).toBeInTheDocument();
  });

  it("calls onSelect with the allItemsId when 'All Items' is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { root } = buildTree();

    render(<GroupTree {...baseProps(root, { onSelect, selectedGroupId: "some-group" })} />);

    await user.click(screen.getByRole("button", { name: /all items/i }));

    expect(onSelect).toHaveBeenCalledWith("__all__");
  });

  describe("adding a group", () => {
    it("adds a top-level group via the Add group button", async () => {
      const user = userEvent.setup();
      const onCreateGroup = vi.fn().mockResolvedValue(undefined);
      const { root } = buildTree();

      render(<GroupTree {...baseProps(root, { onCreateGroup })} />);

      await user.click(screen.getByRole("button", { name: "Add group" }));
      await user.type(screen.getByLabelText("New group name"), "New Group");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onCreateGroup).toHaveBeenCalledWith(root.id, "New Group");
      expect(screen.queryByLabelText("New group name")).not.toBeInTheDocument();
    });

    it("adds a subgroup to a nested group via its Add subgroup button", async () => {
      const user = userEvent.setup();
      const onCreateGroup = vi.fn().mockResolvedValue(undefined);
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onCreateGroup })} />);

      await user.click(screen.getByRole("button", { name: `Add subgroup to ${work.name}` }));
      await user.type(screen.getByLabelText("New group name"), "Sub");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onCreateGroup).toHaveBeenCalledWith(work.id, "Sub");
    });

    it("shows a validation error and does not call onCreateGroup when the name is blank", async () => {
      const user = userEvent.setup();
      const onCreateGroup = vi.fn();
      const { root } = buildTree();

      render(<GroupTree {...baseProps(root, { onCreateGroup })} />);

      await user.click(screen.getByRole("button", { name: "Add group" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByText("Group name is required.")).toBeInTheDocument();
      expect(onCreateGroup).not.toHaveBeenCalled();
    });

    it("shows the error message when onCreateGroup rejects with an Error", async () => {
      const user = userEvent.setup();
      const onCreateGroup = vi.fn().mockRejectedValue(new Error("Save failed"));
      const { root } = buildTree();

      render(<GroupTree {...baseProps(root, { onCreateGroup })} />);

      await user.click(screen.getByRole("button", { name: "Add group" }));
      await user.type(screen.getByLabelText("New group name"), "New Group");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Save failed")).toBeInTheDocument();
    });

    it("shows a generic error when onCreateGroup rejects with a non-Error", async () => {
      const user = userEvent.setup();
      const onCreateGroup = vi.fn().mockRejectedValue("nope");
      const { root } = buildTree();

      render(<GroupTree {...baseProps(root, { onCreateGroup })} />);

      await user.click(screen.getByRole("button", { name: "Add group" }));
      await user.type(screen.getByLabelText("New group name"), "New Group");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("cancels the add-group form", async () => {
      const user = userEvent.setup();
      const { root } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      await user.click(screen.getByRole("button", { name: "Add group" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByLabelText("New group name")).not.toBeInTheDocument();
    });

    it("submits the add-group form with Enter", async () => {
      const user = userEvent.setup();
      const onCreateGroup = vi.fn().mockResolvedValue(undefined);
      const { root } = buildTree();

      render(<GroupTree {...baseProps(root, { onCreateGroup })} />);

      await user.click(screen.getByRole("button", { name: "Add group" }));
      await user.type(screen.getByLabelText("New group name"), "Keyboard{Enter}");

      expect(onCreateGroup).toHaveBeenCalledWith(root.id, "Keyboard");
    });

    it("cancels the add-group form with Escape, ignoring other keys", async () => {
      const user = userEvent.setup();
      const { root } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      await user.click(screen.getByRole("button", { name: "Add group" }));
      await user.type(screen.getByLabelText("New group name"), "x");
      expect(screen.getByLabelText("New group name")).toHaveValue("x");
      await user.keyboard("{Escape}");

      expect(screen.queryByLabelText("New group name")).not.toBeInTheDocument();
    });

    it("marks the name input invalid while a validation error is shown", async () => {
      const user = userEvent.setup();
      const { root } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      await user.click(screen.getByRole("button", { name: "Add group" }));
      expect(screen.getByLabelText("New group name")).toHaveAttribute("aria-invalid", "false");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByLabelText("New group name")).toHaveAttribute("aria-invalid", "true");
    });
  });

  describe("renaming a group", () => {
    it("renames a group, prefilled with its current name", async () => {
      const user = userEvent.setup();
      const onRenameGroup = vi.fn().mockResolvedValue(undefined);
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onRenameGroup })} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Rename" }));
      const input = screen.getByRole("textbox", { name: `Rename ${work.name}` });
      expect(input).toHaveValue("Work");
      await user.clear(input);
      await user.type(input, "Renamed Work");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onRenameGroup).toHaveBeenCalledWith(work.id, "Renamed Work");
    });

    it("shows a validation error when clearing the name to blank", async () => {
      const user = userEvent.setup();
      const onRenameGroup = vi.fn();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onRenameGroup })} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Rename" }));
      await user.clear(screen.getByRole("textbox", { name: `Rename ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByText("Group name is required.")).toBeInTheDocument();
      expect(onRenameGroup).not.toHaveBeenCalled();
    });

    it("shows an error message when onRenameGroup rejects", async () => {
      const user = userEvent.setup();
      const onRenameGroup = vi.fn().mockRejectedValue(new Error("Rename failed"));
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onRenameGroup })} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Rename" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Rename failed")).toBeInTheDocument();
    });

    it("cancels the rename form", async () => {
      const user = userEvent.setup();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Rename" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByRole("textbox", { name: `Rename ${work.name}` }),
      ).not.toBeInTheDocument();
    });
  });

  describe("the row's More actions menu", () => {
    it("does not select the group when its trigger is clicked", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onSelect })} />);

      await openRowMenu(user, work.name);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("toggles the menu closed when its trigger is clicked again", async () => {
      const user = userEvent.setup();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      const trigger = screen.getByRole("button", { name: `More actions for ${work.name}` });
      await user.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");

      await user.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("closes the menu on an outside click", async () => {
      const user = userEvent.setup();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      const trigger = screen.getByRole("button", { name: `More actions for ${work.name}` });
      await user.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");

      await user.click(document.body);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("closes the menu on Escape but not other keys", async () => {
      const user = userEvent.setup();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      const trigger = screen.getByRole("button", { name: `More actions for ${work.name}` });
      await user.click(trigger);
      await user.keyboard("a");
      expect(trigger).toHaveAttribute("aria-expanded", "true");

      await user.keyboard("{Escape}");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("switches to a different group's menu without closing first", async () => {
      const user = userEvent.setup();
      const { root, work, personal } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      await openRowMenu(user, work.name);
      await openRowMenu(user, personal.name);

      expect(screen.getByRole("button", { name: `More actions for ${work.name}` })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(
        screen.getByRole("button", { name: `More actions for ${personal.name}` }),
      ).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("changing a group's icon", () => {
    it("opens the icon popover already expanded and picks an icon", async () => {
      const user = userEvent.setup();
      const onChangeGroupIcon = vi.fn().mockResolvedValue(undefined);
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onChangeGroupIcon })} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Change icon" }));
      await user.click(screen.getByRole("button", { name: "Star" }));

      expect(onChangeGroupIcon).toHaveBeenCalledWith(work.id, Icon.library("star"), undefined);
    });

    it("closes the menu once the icon popover opens", async () => {
      const user = userEvent.setup();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Change icon" }));

      expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Icons" })).toBeInTheDocument();
    });

    it("keeps the trigger marked as open while the icon popover it launched is showing", async () => {
      const user = userEvent.setup();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Change icon" }));

      const trigger = screen.getByRole("button", { name: `More actions for ${work.name}` });
      expect(trigger).toHaveClass("active");

      await user.click(document.body);
      expect(trigger).not.toHaveClass("active");
      expect(screen.queryByRole("tab", { name: "Icons" })).not.toBeInTheDocument();
    });

    it("shows an error message when onChangeGroupIcon rejects", async () => {
      const user = userEvent.setup();
      const onChangeGroupIcon = vi.fn().mockRejectedValue(new Error("Icon change failed"));
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onChangeGroupIcon })} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Change icon" }));
      await user.click(screen.getByRole("button", { name: "Star" }));

      expect(await screen.findByText("Icon change failed")).toBeInTheDocument();
    });
  });

  describe("deleting a group", () => {
    it("asks for confirmation, then calls onDeleteGroup", async () => {
      const user = userEvent.setup();
      const onDeleteGroup = vi.fn().mockResolvedValue(undefined);
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onDeleteGroup })} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText('Delete "Work"?')).toBeInTheDocument();
      expect(screen.getByText(/will be deleted too/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(onDeleteGroup).toHaveBeenCalledWith(work.id);
    });

    it("explains that contents move to the parent group when keeping contents", async () => {
      const user = userEvent.setup();
      const work = Group.create("Work");
      const root = Group.create("Root").addGroup(work);

      render(<GroupTree {...baseProps(root, { groupDeleteMode: "keepContents" })} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText(/will move to the parent group/i)).toBeInTheDocument();
    });

    it("cancels the delete confirmation without calling onDeleteGroup", async () => {
      const user = userEvent.setup();
      const onDeleteGroup = vi.fn();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onDeleteGroup })} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onDeleteGroup).not.toHaveBeenCalled();
      expect(screen.queryByText('Delete "Work"?')).not.toBeInTheDocument();
    });

    it("shows an error message when onDeleteGroup rejects with a non-Error", async () => {
      const user = userEvent.setup();
      const onDeleteGroup = vi.fn().mockRejectedValue("nope");
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onDeleteGroup })} />);

      await openRowMenu(user, work.name);
      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("nope")).toBeInTheDocument();
    });
  });

  describe("dropping an entry onto a group", () => {
    function entryTransfer(entryId = "entry-1") {
      return {
        types: [ENTRY_DRAG_TYPE],
        dropEffect: "none",
        getData: (type: string) => (type === ENTRY_DRAG_TYPE ? entryId : ""),
      };
    }

    function groupRow(name: string) {
      return rowButton(name).closest(".group-row") as HTMLElement;
    }

    function dragLeave(row: HTMLElement, relatedTarget: Element | null) {
      const event = createEvent.dragLeave(row);
      Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
      fireEvent(row, event);
    }

    it("outlines every group while an entry drag is active", () => {
      const { root } = buildTree();

      const { container } = render(<GroupTree {...baseProps(root, { entryDragActive: true })} />);

      expect(container.querySelector(".group-sidebar")).toHaveClass("entry-drag-active");
    });

    it("highlights the hovered group as a move target", () => {
      const { root } = buildTree();
      render(<GroupTree {...baseProps(root)} />);
      const row = groupRow("Work");
      const dataTransfer = entryTransfer();

      fireEvent.dragEnter(row, { dataTransfer });
      fireEvent.dragOver(row, { dataTransfer });

      expect(row).toHaveClass("drop-target");
      expect(dataTransfer.dropEffect).toBe("move");
    });

    it("ignores drags that don't carry an entry, like files", () => {
      const { root } = buildTree();
      render(<GroupTree {...baseProps(root)} />);
      const row = groupRow("Work");

      fireEvent.dragOver(row, { dataTransfer: { types: ["Files"] } });

      expect(row).not.toHaveClass("drop-target");
    });

    it("keeps the highlight while moving over the row's own children, clears it on leaving", () => {
      const { root } = buildTree();
      render(<GroupTree {...baseProps(root)} />);
      const row = groupRow("Work");

      fireEvent.dragOver(row, { dataTransfer: entryTransfer() });
      dragLeave(row, rowButton("Work"));
      expect(row).toHaveClass("drop-target");

      dragLeave(row, null);
      expect(row).not.toHaveClass("drop-target");
    });

    it("doesn't clear another group's highlight when leaving a stale row", () => {
      const { root } = buildTree();
      render(<GroupTree {...baseProps(root)} />);

      fireEvent.dragOver(groupRow("Personal"), { dataTransfer: entryTransfer() });
      dragLeave(groupRow("Work"), null);

      expect(groupRow("Personal")).toHaveClass("drop-target");
    });

    it("moves the dropped entry into the group and flashes the row", async () => {
      const onDropEntry = vi.fn().mockResolvedValue(undefined);
      const { root, work } = buildTree();
      render(<GroupTree {...baseProps(root, { onDropEntry })} />);
      const row = groupRow("Work");

      fireEvent.dragOver(row, { dataTransfer: entryTransfer("abc") });
      fireEvent.drop(row, { dataTransfer: entryTransfer("abc") });

      expect(onDropEntry).toHaveBeenCalledWith("abc", work.id);
      expect(row).not.toHaveClass("drop-target");
      await vi.waitFor(() => expect(row).toHaveClass("drop-flash"));

      // jsdom has no AnimationEvent, so React listens for the prefixed name.
      fireEvent(row, new Event("webkitAnimationEnd", { bubbles: true }));
      expect(row).not.toHaveClass("drop-flash");
    });

    it("takes an entry out of its group when it's dropped on All Items", async () => {
      const onDropEntry = vi.fn().mockResolvedValue(undefined);
      const { root } = buildTree();
      render(<GroupTree {...baseProps(root, { onDropEntry })} />);
      const allItems = screen.getByRole("button", { name: /all items/i });

      fireEvent.dragEnter(allItems, { dataTransfer: entryTransfer("abc") });
      fireEvent.dragOver(allItems, { dataTransfer: entryTransfer("abc") });
      expect(allItems).toHaveClass("drop-target");

      dragLeave(allItems, null);
      expect(allItems).not.toHaveClass("drop-target");

      fireEvent.drop(allItems, { dataTransfer: entryTransfer("abc") });

      expect(onDropEntry).toHaveBeenCalledWith("abc", root.id);
      await vi.waitFor(() => expect(allItems).toHaveClass("drop-flash"));

      fireEvent(allItems, new Event("webkitAnimationEnd", { bubbles: true }));
      expect(allItems).not.toHaveClass("drop-flash");
    });

    it("shows an error when the move fails, and clears it after a later successful drop", async () => {
      const onDropEntry = vi
        .fn()
        .mockRejectedValueOnce(new Error("Save failed"))
        .mockResolvedValueOnce(undefined);
      const { root } = buildTree();
      render(<GroupTree {...baseProps(root, { onDropEntry })} />);

      fireEvent.drop(groupRow("Work"), { dataTransfer: entryTransfer() });
      expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");

      fireEvent.drop(groupRow("Work"), { dataTransfer: entryTransfer() });
      await vi.waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    });
  });

  describe("reordering groups by dragging", () => {
    function groupTransfer(groupId: string) {
      return {
        types: [GROUP_DRAG_TYPE],
        dropEffect: "none",
        effectAllowed: "none",
        setData: () => {},
        getData: (type: string) => (type === GROUP_DRAG_TYPE ? groupId : ""),
      };
    }

    function groupRow(name: string) {
      return rowButton(name).closest(".group-row") as HTMLElement;
    }

    // jsdom has no DragEvent, so fireEvent's plain Event fallback silently
    // drops clientY — set it directly on the event, the same workaround
    // used above for relatedTarget on dragLeave.
    function dragOverAt(row: HTMLElement, dataTransfer: unknown, clientY: number) {
      const event = createEvent.dragOver(row, { dataTransfer });
      Object.defineProperty(event, "clientY", { value: clientY });
      fireEvent(row, event);
    }

    function dropAt(row: HTMLElement, dataTransfer: unknown, clientY: number) {
      const event = createEvent.drop(row, { dataTransfer });
      Object.defineProperty(event, "clientY", { value: clientY });
      fireEvent(row, event);
    }

    function dragLeaveGroup(
      row: HTMLElement,
      dataTransfer: unknown,
      relatedTarget: Element | null,
    ) {
      const event = createEvent.dragLeave(row, { dataTransfer });
      Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
      fireEvent(row, event);
    }

    it("reorders a group to sit before its sibling when dropped on the top half", () => {
      const onMoveGroupToPosition = vi.fn().mockResolvedValue(undefined);
      const { root, work, personal } = buildTree();
      render(<GroupTree {...baseProps(root, { onMoveGroupToPosition })} />);
      const dataTransfer = groupTransfer(personal.id.toString());

      fireEvent.dragStart(groupRow("Personal"), { dataTransfer });
      dropAt(groupRow("Work"), dataTransfer, -1000);

      expect(onMoveGroupToPosition).toHaveBeenCalledWith(personal.id, root.id, work.id);
    });

    it("reorders a group to the end when dropped on the bottom half of the last sibling", () => {
      const onMoveGroupToPosition = vi.fn().mockResolvedValue(undefined);
      const { root, work } = buildTree();
      render(<GroupTree {...baseProps(root, { onMoveGroupToPosition })} />);
      const dataTransfer = groupTransfer(work.id.toString());

      fireEvent.dragStart(groupRow("Work"), { dataTransfer });
      dropAt(groupRow("Personal"), dataTransfer, 1000);

      expect(onMoveGroupToPosition).toHaveBeenCalledWith(work.id, root.id, undefined);
    });

    it("lands before a trailing recycle bin instead of past it", () => {
      const onMoveGroupToPosition = vi.fn().mockResolvedValue(undefined);
      const { root, work } = buildTree();
      const recycleBin = Group.create("Recycle Bin");
      const rootWithBin = root.addGroup(recycleBin);
      render(<GroupTree {...baseProps(rootWithBin, { onMoveGroupToPosition, recycleBin })} />);
      const dataTransfer = groupTransfer(work.id.toString());

      fireEvent.dragStart(groupRow("Work"), { dataTransfer });
      dropAt(groupRow("Personal"), dataTransfer, 1000);

      expect(onMoveGroupToPosition).toHaveBeenCalledWith(work.id, rootWithBin.id, recycleBin.id);
    });

    it("shows a reorder indicator on the hovered row's edge while dragging", () => {
      const { root, work } = buildTree();
      render(<GroupTree {...baseProps(root)} />);
      const dataTransfer = groupTransfer(work.id.toString());

      fireEvent.dragStart(groupRow("Work"), { dataTransfer });
      dragOverAt(groupRow("Personal"), dataTransfer, -1000);
      expect(groupRow("Personal")).toHaveClass("reorder-before");

      dragOverAt(groupRow("Personal"), dataTransfer, 1000);
      expect(groupRow("Personal")).toHaveClass("reorder-after");
      expect(groupRow("Personal")).not.toHaveClass("reorder-before");
    });

    it("doesn't clear a different row's reorder indicator when leaving a stale row", () => {
      const { root, work } = buildTree();
      render(<GroupTree {...baseProps(root)} />);
      const dataTransfer = groupTransfer(work.id.toString());

      fireEvent.dragStart(groupRow("Work"), { dataTransfer });
      dragOverAt(groupRow("Personal"), dataTransfer, -1000);
      expect(groupRow("Personal")).toHaveClass("reorder-before");

      dragLeaveGroup(groupRow("Work"), dataTransfer, null);

      expect(groupRow("Personal")).toHaveClass("reorder-before");
    });

    it("clears the reorder indicator when leaving the row it's showing on", () => {
      const { root, work } = buildTree();
      render(<GroupTree {...baseProps(root)} />);
      const dataTransfer = groupTransfer(work.id.toString());

      fireEvent.dragStart(groupRow("Work"), { dataTransfer });
      dragOverAt(groupRow("Personal"), dataTransfer, -1000);
      expect(groupRow("Personal")).toHaveClass("reorder-before");

      dragLeaveGroup(groupRow("Personal"), dataTransfer, null);

      expect(groupRow("Personal")).not.toHaveClass("reorder-before");
    });

    it("ignores a group drag-leave when no reorder indicator is showing", () => {
      const { root, work } = buildTree();
      render(<GroupTree {...baseProps(root)} />);
      const dataTransfer = groupTransfer(work.id.toString());

      fireEvent.dragStart(groupRow("Work"), { dataTransfer });
      dragLeaveGroup(groupRow("Personal"), dataTransfer, null);

      expect(groupRow("Personal")).not.toHaveClass("reorder-before");
      expect(groupRow("Personal")).not.toHaveClass("reorder-after");
    });

    it("dims the row being dragged and clears it on drag end", () => {
      const { root } = buildTree();
      render(<GroupTree {...baseProps(root)} />);

      fireEvent.dragStart(groupRow("Work"), { dataTransfer: groupTransfer("whatever") });
      expect(groupRow("Work")).toHaveClass("dragging");

      fireEvent.dragEnd(groupRow("Work"));
      expect(groupRow("Work")).not.toHaveClass("dragging");
    });

    it("shows a reorder indicator on a different parent's row, and moves a nested group out to that level on drop", () => {
      const onMoveGroupToPosition = vi.fn().mockResolvedValue(undefined);
      const { root, nested, personal } = buildTree();
      render(<GroupTree {...baseProps(root, { onMoveGroupToPosition })} />);
      const dataTransfer = groupTransfer(nested.id.toString());

      fireEvent.dragStart(groupRow("Nested"), { dataTransfer });
      dragOverAt(groupRow("Personal"), dataTransfer, -1000);
      expect(groupRow("Personal")).toHaveClass("reorder-before");

      dropAt(groupRow("Personal"), dataTransfer, -1000);
      expect(onMoveGroupToPosition).toHaveBeenCalledWith(nested.id, root.id, personal.id);
    });

    it("drags a top-level group in to sit among a nested group's siblings", () => {
      const onMoveGroupToPosition = vi.fn().mockResolvedValue(undefined);
      const { root, work, nested, personal } = buildTree();
      render(<GroupTree {...baseProps(root, { onMoveGroupToPosition })} />);
      const dataTransfer = groupTransfer(personal.id.toString());

      fireEvent.dragStart(groupRow("Personal"), { dataTransfer });
      dragOverAt(groupRow("Nested"), dataTransfer, -1000);
      expect(groupRow("Nested")).toHaveClass("reorder-before");

      dropAt(groupRow("Nested"), dataTransfer, -1000);
      expect(onMoveGroupToPosition).toHaveBeenCalledWith(personal.id, work.id, nested.id);
    });

    it("shows no indicator and blocks dropping a group onto one of its own descendants", () => {
      const onMoveGroupToPosition = vi.fn();
      const { root, work } = buildTree();
      render(<GroupTree {...baseProps(root, { onMoveGroupToPosition })} />);
      const dataTransfer = groupTransfer(work.id.toString());

      fireEvent.dragStart(groupRow("Work"), { dataTransfer });
      dragOverAt(groupRow("Nested"), dataTransfer, -1000);
      expect(groupRow("Nested")).not.toHaveClass("reorder-before");
      expect(groupRow("Nested")).not.toHaveClass("reorder-after");

      dropAt(groupRow("Nested"), dataTransfer, -1000);
      expect(onMoveGroupToPosition).not.toHaveBeenCalled();
    });

    it("ignores a group drag-over before any drag has started", () => {
      const { root } = buildTree();
      render(<GroupTree {...baseProps(root)} />);

      dragOverAt(groupRow("Personal"), groupTransfer("whatever"), -1000);

      expect(groupRow("Personal")).not.toHaveClass("reorder-before");
    });

    it("shows no indicator when a group is dragged over itself", () => {
      const { root, work } = buildTree();
      render(<GroupTree {...baseProps(root)} />);
      const dataTransfer = groupTransfer(work.id.toString());

      fireEvent.dragStart(groupRow("Work"), { dataTransfer });
      dragOverAt(groupRow("Work"), dataTransfer, -1000);

      expect(groupRow("Work")).not.toHaveClass("reorder-before");
      expect(groupRow("Work")).not.toHaveClass("reorder-after");
    });

    it("ignores dropping a group onto itself", () => {
      const onMoveGroupToPosition = vi.fn();
      const { root, work } = buildTree();
      render(<GroupTree {...baseProps(root, { onMoveGroupToPosition })} />);
      const dataTransfer = groupTransfer(work.id.toString());

      fireEvent.dragStart(groupRow("Work"), { dataTransfer });
      dropAt(groupRow("Work"), dataTransfer, -1000);

      expect(onMoveGroupToPosition).not.toHaveBeenCalled();
    });

    it("shows an error message when onMoveGroupToPosition rejects", async () => {
      const onMoveGroupToPosition = vi.fn().mockRejectedValue(new Error("Move failed"));
      const { root, personal } = buildTree();
      render(<GroupTree {...baseProps(root, { onMoveGroupToPosition })} />);
      const dataTransfer = groupTransfer(personal.id.toString());

      fireEvent.dragStart(groupRow("Personal"), { dataTransfer });
      dropAt(groupRow("Work"), dataTransfer, -1000);

      expect(await screen.findByText("Move failed")).toBeInTheDocument();
    });

    describe("dragging onto the middle of a row to reparent", () => {
      it("shows a reparent indicator, not a reorder edge, over the middle of another row", () => {
        const { root, personal } = buildTree();
        render(<GroupTree {...baseProps(root)} />);
        const dataTransfer = groupTransfer(personal.id.toString());

        fireEvent.dragStart(groupRow("Personal"), { dataTransfer });
        dragOverAt(groupRow("Work"), dataTransfer, 0);

        expect(groupRow("Work")).toHaveClass("reorder-into");
        expect(groupRow("Work")).not.toHaveClass("reorder-before");
        expect(groupRow("Work")).not.toHaveClass("reorder-after");
      });

      it("moves the dragged group into the hovered group and flashes it, even across different parents", async () => {
        const onMoveGroupToParent = vi.fn().mockResolvedValue(undefined);
        const { root, nested, personal } = buildTree();
        render(<GroupTree {...baseProps(root, { onMoveGroupToParent })} />);
        const dataTransfer = groupTransfer(nested.id.toString());
        const row = groupRow("Personal");

        fireEvent.dragStart(groupRow("Nested"), { dataTransfer });
        dropAt(row, dataTransfer, 0);

        expect(onMoveGroupToParent).toHaveBeenCalledWith(nested.id, personal.id);
        await vi.waitFor(() => expect(row).toHaveClass("drop-flash"));
      });

      it("blocks reparenting a group into its own descendant", () => {
        const onMoveGroupToParent = vi.fn();
        const { root, work } = buildTree();
        render(<GroupTree {...baseProps(root, { onMoveGroupToParent })} />);
        const dataTransfer = groupTransfer(work.id.toString());

        fireEvent.dragStart(groupRow("Work"), { dataTransfer });
        dragOverAt(groupRow("Nested"), dataTransfer, 0);
        expect(groupRow("Nested")).not.toHaveClass("reorder-into");

        dropAt(groupRow("Nested"), dataTransfer, 0);
        expect(onMoveGroupToParent).not.toHaveBeenCalled();
      });

      it("shows an error message when onMoveGroupToParent rejects", async () => {
        const onMoveGroupToParent = vi.fn().mockRejectedValue(new Error("Move failed"));
        const { root, personal } = buildTree();
        render(<GroupTree {...baseProps(root, { onMoveGroupToParent })} />);
        const dataTransfer = groupTransfer(personal.id.toString());

        fireEvent.dragStart(groupRow("Personal"), { dataTransfer });
        dropAt(groupRow("Work"), dataTransfer, 0);

        expect(await screen.findByText("Move failed")).toBeInTheDocument();
      });
    });
  });

  describe("recycle bin row", () => {
    it("does not render a Recycle Bin row when there is none", () => {
      const { root } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      expect(screen.queryByText("Recycle Bin")).not.toBeInTheDocument();
    });

    it("renders the recycle bin as a fixed row, excluded from the normal Groups tree", () => {
      const { root } = buildTree();
      const recycleBin = Group.create("Recycle Bin");
      const rootWithBin = root.addGroup(recycleBin);

      render(<GroupTree {...baseProps(rootWithBin, { recycleBin })} />);

      expect(screen.getByText("Recycle Bin")).toBeInTheDocument();
      expect(rowButton("Work")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: `Delete ${recycleBin.name}` }),
      ).not.toBeInTheDocument();
    });

    it("selects the recycle bin when its row is clicked", async () => {
      const user = userEvent.setup();
      const { root } = buildTree();
      const recycleBin = Group.create("Recycle Bin");
      const rootWithBin = root.addGroup(recycleBin);
      const onSelect = vi.fn();

      render(<GroupTree {...baseProps(rootWithBin, { recycleBin, onSelect })} />);

      await user.click(screen.getByText("Recycle Bin"));

      expect(onSelect).toHaveBeenCalledWith(recycleBin.id.toString());
    });

    it("marks the recycle bin row active when it is selected", () => {
      const { root } = buildTree();
      const recycleBin = Group.create("Recycle Bin");
      const rootWithBin = root.addGroup(recycleBin);

      render(
        <GroupTree
          {...baseProps(rootWithBin, { recycleBin, selectedGroupId: recycleBin.id.toString() })}
        />,
      );

      expect(screen.getByText("Recycle Bin").closest("button")?.className).toContain("active");
    });

    it("shows the recycle bin's total recursive entry count", () => {
      const { root } = buildTree();
      const nested = Group.create("Nested Deleted").addEntry(Entry.create({ title: "Deep" }));
      const recycleBin = Group.create("Recycle Bin")
        .addEntry(Entry.create({ title: "Direct" }))
        .addGroup(nested);
      const rootWithBin = root.addGroup(recycleBin);

      render(<GroupTree {...baseProps(rootWithBin, { recycleBin })} />);

      const binRow = screen.getByText("Recycle Bin").closest("button")!;
      expect(binRow).toHaveTextContent("2");
    });
  });
});
