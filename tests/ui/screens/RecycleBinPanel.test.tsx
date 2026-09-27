import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, Group } from "../../../src/domain";
import { RecycleBinPanel } from "../../../src/ui/screens/RecycleBinPanel";

function baseProps(
  binGroup: Group,
  overrides: Partial<Parameters<typeof RecycleBinPanel>[0]> = {},
) {
  return {
    binGroup,
    onRestoreEntry: vi.fn().mockResolvedValue(undefined),
    onDeleteEntryForever: vi.fn().mockResolvedValue(undefined),
    onRestoreGroup: vi.fn().mockResolvedValue(undefined),
    onDeleteGroupForever: vi.fn().mockResolvedValue(undefined),
    onEmptyRecycleBin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("RecycleBinPanel", () => {
  it("shows an empty message and disables Empty Recycle Bin when the bin is empty", () => {
    const bin = Group.create("Recycle Bin");

    render(<RecycleBinPanel {...baseProps(bin)} />);

    expect(screen.getByText("The recycle bin is empty.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empty Recycle Bin" })).toBeDisabled();
  });

  it("notes how much restoring a deleted group would put back", () => {
    const grandchild = Group.create("Archive").addEntry(Entry.create({ title: "Old" }));
    const deletedGroup = Group.create("Deleted Group")
      .addEntry(Entry.create({ title: "Inside" }))
      .addGroup(grandchild);
    const bin = Group.create("Recycle Bin").addGroup(deletedGroup);

    render(<RecycleBinPanel {...baseProps(bin)} />);

    expect(screen.getByText("Restores 2 entries · 1 subgroup")).toBeInTheDocument();
  });

  it("notes an emptied group as restoring no entries", () => {
    const bin = Group.create("Recycle Bin").addGroup(Group.create("Deleted Group"));

    render(<RecycleBinPanel {...baseProps(bin)} />);

    expect(screen.getByText("Restores 0 entries")).toBeInTheDocument();
  });

  it("lists deleted groups and deleted entries in separate sections", () => {
    const deletedGroup = Group.create("Deleted Group");
    const bin = Group.create("Recycle Bin")
      .addEntry(Entry.create({ title: "Deleted Entry", username: "octocat" }))
      .addGroup(deletedGroup);

    render(<RecycleBinPanel {...baseProps(bin)} />);

    expect(screen.getByText("Deleted Groups")).toBeInTheDocument();
    expect(screen.getByText("Deleted Group")).toBeInTheDocument();
    expect(screen.getByText("Deleted Entries")).toBeInTheDocument();
    expect(screen.getByText("Deleted Entry")).toBeInTheDocument();
    expect(screen.getByText("octocat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empty Recycle Bin" })).toBeEnabled();
  });

  it("shows a placeholder title for a deleted entry with a blank title", () => {
    const bin = Group.create("Recycle Bin").addEntry(Entry.create({ title: "" }));

    render(<RecycleBinPanel {...baseProps(bin)} />);

    expect(screen.getByText("(untitled)")).toBeInTheDocument();
  });

  it("lists entries nested inside a deleted subgroup alongside top-level deleted entries", () => {
    const nested = Group.create("Nested").addEntry(Entry.create({ title: "Nested Entry" }));
    const bin = Group.create("Recycle Bin").addGroup(nested);

    render(<RecycleBinPanel {...baseProps(bin)} />);

    expect(screen.getByText("Nested Entry")).toBeInTheDocument();
  });

  describe("restoring", () => {
    it("restores a deleted entry", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Deleted Entry" });
      const bin = Group.create("Recycle Bin").addEntry(entry);
      const onRestoreEntry = vi.fn().mockResolvedValue(undefined);

      render(<RecycleBinPanel {...baseProps(bin, { onRestoreEntry })} />);

      await user.click(screen.getByRole("button", { name: "Restore" }));

      expect(onRestoreEntry).toHaveBeenCalledWith(entry.id);
    });

    it("restores a deleted group", async () => {
      const user = userEvent.setup();
      const deletedGroup = Group.create("Deleted Group");
      const bin = Group.create("Recycle Bin").addGroup(deletedGroup);
      const onRestoreGroup = vi.fn().mockResolvedValue(undefined);

      render(<RecycleBinPanel {...baseProps(bin, { onRestoreGroup })} />);

      await user.click(screen.getByRole("button", { name: "Restore" }));

      expect(onRestoreGroup).toHaveBeenCalledWith(deletedGroup.id);
    });
  });

  describe("permanently deleting an entry", () => {
    it("asks for confirmation, then deletes forever", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Deleted Entry" });
      const bin = Group.create("Recycle Bin").addEntry(entry);
      const onDeleteEntryForever = vi.fn().mockResolvedValue(undefined);

      render(<RecycleBinPanel {...baseProps(bin, { onDeleteEntryForever })} />);

      await user.click(screen.getByRole("button", { name: "Delete Forever" }));
      expect(screen.getByText('Permanently delete "Deleted Entry"?')).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Delete Forever" }));

      expect(onDeleteEntryForever).toHaveBeenCalledWith(entry.id);
    });

    it("cancels without deleting", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Deleted Entry" });
      const bin = Group.create("Recycle Bin").addEntry(entry);
      const onDeleteEntryForever = vi.fn();

      render(<RecycleBinPanel {...baseProps(bin, { onDeleteEntryForever })} />);

      await user.click(screen.getByRole("button", { name: "Delete Forever" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onDeleteEntryForever).not.toHaveBeenCalled();
      expect(screen.queryByText('Permanently delete "Deleted Entry"?')).not.toBeInTheDocument();
    });

    it("shows an error message when deleting fails", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Deleted Entry" });
      const bin = Group.create("Recycle Bin").addEntry(entry);
      const onDeleteEntryForever = vi.fn().mockRejectedValue(new Error("Disk full"));

      render(<RecycleBinPanel {...baseProps(bin, { onDeleteEntryForever })} />);

      await user.click(screen.getByRole("button", { name: "Delete Forever" }));
      await user.click(screen.getByRole("button", { name: "Delete Forever" }));

      expect(await screen.findByText("Disk full")).toBeInTheDocument();
    });

    it("shows a placeholder title in the confirmation text for a blank-titled entry", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "" });
      const bin = Group.create("Recycle Bin").addEntry(entry);

      render(<RecycleBinPanel {...baseProps(bin)} />);

      await user.click(screen.getByRole("button", { name: "Delete Forever" }));

      expect(screen.getByText('Permanently delete "(untitled)"?')).toBeInTheDocument();
    });

    it("shows a generic error message when deleting rejects with a non-Error", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Deleted Entry" });
      const bin = Group.create("Recycle Bin").addEntry(entry);
      const onDeleteEntryForever = vi.fn().mockRejectedValue("nope");

      render(<RecycleBinPanel {...baseProps(bin, { onDeleteEntryForever })} />);

      await user.click(screen.getByRole("button", { name: "Delete Forever" }));
      await user.click(screen.getByRole("button", { name: "Delete Forever" }));

      expect(await screen.findByText("nope")).toBeInTheDocument();
    });
  });

  describe("permanently deleting a group", () => {
    it("asks for confirmation, then deletes forever", async () => {
      const user = userEvent.setup();
      const deletedGroup = Group.create("Deleted Group");
      const bin = Group.create("Recycle Bin").addGroup(deletedGroup);
      const onDeleteGroupForever = vi.fn().mockResolvedValue(undefined);

      render(<RecycleBinPanel {...baseProps(bin, { onDeleteGroupForever })} />);

      await user.click(screen.getByRole("button", { name: "Delete Forever" }));
      expect(screen.getByText('Permanently delete "Deleted Group"?')).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Delete Forever" }));

      expect(onDeleteGroupForever).toHaveBeenCalledWith(deletedGroup.id);
    });

    it("cancels without deleting", async () => {
      const user = userEvent.setup();
      const deletedGroup = Group.create("Deleted Group");
      const bin = Group.create("Recycle Bin").addGroup(deletedGroup);
      const onDeleteGroupForever = vi.fn();

      render(<RecycleBinPanel {...baseProps(bin, { onDeleteGroupForever })} />);

      await user.click(screen.getByRole("button", { name: "Delete Forever" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onDeleteGroupForever).not.toHaveBeenCalled();
      expect(screen.queryByText('Permanently delete "Deleted Group"?')).not.toBeInTheDocument();
    });
  });

  describe("emptying the recycle bin", () => {
    it("asks for confirmation, then empties it", async () => {
      const user = userEvent.setup();
      const bin = Group.create("Recycle Bin").addEntry(Entry.create({ title: "Deleted Entry" }));
      const onEmptyRecycleBin = vi.fn().mockResolvedValue(undefined);

      render(<RecycleBinPanel {...baseProps(bin, { onEmptyRecycleBin })} />);

      await user.click(screen.getByRole("button", { name: "Empty Recycle Bin" }));
      expect(
        screen.getByText("Permanently delete everything in the recycle bin?"),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Empty" }));

      expect(onEmptyRecycleBin).toHaveBeenCalled();
    });

    it("cancels without emptying", async () => {
      const user = userEvent.setup();
      const bin = Group.create("Recycle Bin").addEntry(Entry.create({ title: "Deleted Entry" }));
      const onEmptyRecycleBin = vi.fn();

      render(<RecycleBinPanel {...baseProps(bin, { onEmptyRecycleBin })} />);

      await user.click(screen.getByRole("button", { name: "Empty Recycle Bin" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onEmptyRecycleBin).not.toHaveBeenCalled();
      expect(
        screen.queryByText("Permanently delete everything in the recycle bin?"),
      ).not.toBeInTheDocument();
    });
  });
});
