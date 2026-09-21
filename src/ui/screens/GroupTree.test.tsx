import { describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, Group } from "../../domain";
import { GroupTree } from "./GroupTree";
import { ENTRY_DRAG_TYPE } from "../entry-drag";

function buildTree() {
  const nested = Group.create("Nested");
  const work = Group.create("Work").addGroup(nested);
  const personal = Group.create("Personal");
  const root = Group.create("Root").addGroup(work).addGroup(personal);
  return { root, work, nested, personal };
}

// The row-select button's accessible name is its name text concatenated
// directly with its entry count (e.g. "Work0"), which collides on a loose
// match with the row's own "Add subgroup to Work"/"Rename Work"/
// "Delete Work" action buttons — anchor the match to the start of the name
// to pick out just the row button.
function rowButton(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}`, "i") });
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
    entryDragActive: false,
    onDropEntry: vi.fn().mockResolvedValue(undefined),
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

      await user.click(screen.getByRole("button", { name: `Rename ${work.name}` }));
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

      await user.click(screen.getByRole("button", { name: `Rename ${work.name}` }));
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

      await user.click(screen.getByRole("button", { name: `Rename ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Rename failed")).toBeInTheDocument();
    });

    it("cancels the rename form", async () => {
      const user = userEvent.setup();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root)} />);

      await user.click(screen.getByRole("button", { name: `Rename ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByRole("textbox", { name: `Rename ${work.name}` }),
      ).not.toBeInTheDocument();
    });
  });

  describe("deleting a group", () => {
    it("asks for confirmation, then calls onDeleteGroup", async () => {
      const user = userEvent.setup();
      const onDeleteGroup = vi.fn().mockResolvedValue(undefined);
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onDeleteGroup })} />);

      await user.click(screen.getByRole("button", { name: `Delete ${work.name}` }));
      expect(screen.getByText('Delete "Work"?')).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(onDeleteGroup).toHaveBeenCalledWith(work.id);
    });

    it("cancels the delete confirmation without calling onDeleteGroup", async () => {
      const user = userEvent.setup();
      const onDeleteGroup = vi.fn();
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onDeleteGroup })} />);

      await user.click(screen.getByRole("button", { name: `Delete ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onDeleteGroup).not.toHaveBeenCalled();
      expect(screen.queryByText('Delete "Work"?')).not.toBeInTheDocument();
    });

    it("shows an error message when onDeleteGroup rejects with a non-Error", async () => {
      const user = userEvent.setup();
      const onDeleteGroup = vi.fn().mockRejectedValue("nope");
      const { root, work } = buildTree();

      render(<GroupTree {...baseProps(root, { onDeleteGroup })} />);

      await user.click(screen.getByRole("button", { name: `Delete ${work.name}` }));
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
