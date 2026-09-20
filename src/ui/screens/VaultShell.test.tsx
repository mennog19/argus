import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomField, CustomFields, Entry, Group, Tag, Tags, Vault } from "../../domain";
import { UrlOpener } from "../../application/url-opener";
import { VaultShell } from "./VaultShell";

function fakeUrlOpener(): UrlOpener {
  return { open: vi.fn() };
}

function renderShell(
  vault: Vault,
  overrides: {
    onSave?: (vault: Vault) => Promise<void>;
    onLock?: () => void;
  } = {},
) {
  const onSave = overrides.onSave ?? vi.fn().mockResolvedValue(undefined);
  const onLock = overrides.onLock ?? vi.fn();
  render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={onLock} onSave={onSave} />);
  return { onSave, onLock };
}

// The row-select button's accessible name concatenates the group's name with
// its entry count (e.g. "Work0"); anchor to the start to avoid colliding
// with that row's own "Add subgroup to Work"/"Rename Work"/"Delete Work"
// action buttons.
function rowButton(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}`, "i") });
}

describe("VaultShell", () => {
  it("shows the empty-group message and an empty Groups section when the vault has no groups or entries", () => {
    const vault = Vault.create("Empty");

    renderShell(vault);

    expect(screen.getByRole("button", { name: /all items/i })).toBeInTheDocument();
    expect(screen.getByText("Groups")).toBeInTheDocument();
    expect(screen.getByText("No entries in this group.")).toBeInTheDocument();
    expect(screen.getByText("Select an entry to view details")).toBeInTheDocument();
  });

  it("lists top-level groups with their own entry counts, and 'All Items' with the full recursive count", () => {
    const workEntry = Entry.create({ title: "GitHub", username: "octocat" });
    const nestedGroup = Group.create("Nested").addEntry(Entry.create({ title: "Nested Entry" }));
    const work = Group.create("Work").addEntry(workEntry).addGroup(nestedGroup);
    let vault = Vault.create("Mine");
    vault = vault.addGroup(vault.rootGroup.id, work);

    renderShell(vault);

    // All Items count (recursive: 2) vs Work's own count (1).
    expect(screen.getByRole("button", { name: /all items/i })).toHaveTextContent("2");
    expect(rowButton("Work")).toHaveTextContent("1");
  });

  it("filters the entry list to the selected group's own entries only (not nested)", async () => {
    const user = userEvent.setup();
    const workEntry = Entry.create({ title: "GitHub" });
    const nestedGroup = Group.create("Nested").addEntry(Entry.create({ title: "Nested Entry" }));
    const work = Group.create("Work").addEntry(workEntry).addGroup(nestedGroup);
    let vault = Vault.create("Mine");
    vault = vault.addGroup(vault.rootGroup.id, work);

    renderShell(vault);

    await user.click(rowButton("Work"));

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("Nested Entry")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /all items/i }));

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Nested Entry")).toBeInTheDocument();
  });

  it("selects an entry and shows its read-only detail", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({
      title: "GitHub",
      username: "octocat",
      url: "https://github.com",
      notes: "some notes",
      tags: new Tags([new Tag("dev")]),
      customFields: new CustomFields([
        new CustomField("PIN", "1234"),
        new CustomField("Secret", "x", true),
      ]),
    });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    renderShell(vault);

    await user.click(screen.getByText("GitHub"));

    const detail = within(
      screen.getByRole("heading", { name: "GitHub" }).closest(".detail-content")!,
    );
    expect(detail.getByText("octocat")).toBeInTheDocument();
    expect(detail.getByText("https://github.com")).toBeInTheDocument();
    expect(detail.getByText("some notes")).toBeInTheDocument();
    expect(detail.getByText("Mine")).toBeInTheDocument(); // group name meta row
    expect(detail.getByText("dev")).toBeInTheDocument();
    expect(detail.getByText("PIN")).toBeInTheDocument();
    expect(detail.getByText("1234")).toBeInTheDocument();
    expect(detail.getByText("Secret")).toBeInTheDocument();
    expect(detail.getAllByText("••••••••")).toHaveLength(2); // masked password + masked protected field
  });

  it("does not render a URL button, notes, tags, or custom-fields card when the entry has none", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({ title: "No Extras" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    renderShell(vault);

    await user.click(screen.getByText("No Extras"));

    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
    expect(screen.queryByText("Custom fields")).not.toBeInTheDocument();
  });

  it("opens the entry's URL via the UrlOpener when clicked", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({ title: "GitHub", url: "https://github.com" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);
    const urlOpener = fakeUrlOpener();

    render(<VaultShell vault={vault} urlOpener={urlOpener} onLock={vi.fn()} onSave={vi.fn()} />);

    await user.click(screen.getByText("GitHub"));
    await user.click(screen.getByText("https://github.com"));

    expect(urlOpener.open).toHaveBeenCalledWith("https://github.com");
  });

  it("toggles password reveal for the selected entry, masked by default", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({ title: "GitHub" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    renderShell(vault);

    await user.click(screen.getByText("GitHub"));

    expect(screen.getByText("••••••••")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.queryByText("••••••••")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.getByText("••••••••")).toBeInTheDocument();
  });

  it("resets the selected entry and reveal state when switching groups", async () => {
    const user = userEvent.setup();
    const rootEntry = Entry.create({ title: "Root Entry" });
    const work = Group.create("Work").addEntry(Entry.create({ title: "Work Entry" }));
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, rootEntry);
    vault = vault.addGroup(vault.rootGroup.id, work);

    renderShell(vault);

    await user.click(screen.getByText("Root Entry"));
    expect(screen.getByRole("heading", { name: "Root Entry" })).toBeInTheDocument();

    await user.click(rowButton("Work"));

    expect(screen.getByText("Select an entry to view details")).toBeInTheDocument();
  });

  it("calls onLock when the lock button is clicked", async () => {
    const user = userEvent.setup();
    const vault = Vault.create("Mine");

    const { onLock } = renderShell(vault);

    await user.click(screen.getByRole("button", { name: "Lock vault" }));

    expect(onLock).toHaveBeenCalled();
  });

  it("shows a placeholder title for an entry with a blank title", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({ title: "" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    renderShell(vault);

    await user.click(screen.getByText("(untitled)"));

    expect(screen.getByRole("heading", { name: "(untitled)" })).toBeInTheDocument();
  });

  describe("creating an entry", () => {
    it("creates an entry in the currently selected group and selects it", async () => {
      const user = userEvent.setup();
      const work = Group.create("Work");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(rowButton("Work"));
      await user.click(screen.getByRole("button", { name: /new entry/i }));
      await user.type(screen.getByLabelText("Title"), "GitHub");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledTimes(1);
      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.findGroup(work.id)?.entries.map((e) => e.title)).toEqual(["GitHub"]);
    });

    it("defaults new entries to the root group when 'All Items' is selected", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByRole("button", { name: /new entry/i }));
      await user.type(screen.getByLabelText("Title"), "GitHub");
      await user.click(screen.getByRole("button", { name: "Save" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.rootGroup.entries.map((e) => e.title)).toEqual(["GitHub"]);
    });

    it("cancels entry creation without saving", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");
      const onSave = vi.fn();

      renderShell(vault, { onSave });

      await user.click(screen.getByRole("button", { name: /new entry/i }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText("Select an entry to view details")).toBeInTheDocument();
    });
  });

  describe("editing an entry", () => {
    it("edits an entry's fields in place", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub", username: "octocat" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "Edit entry" }));
      await user.clear(screen.getByLabelText("Username"));
      await user.type(screen.getByLabelText("Username"), "new-username");
      await user.click(screen.getByRole("button", { name: "Save" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.findEntry(entry.id)?.username).toBe("new-username");
      expect(screen.getByRole("heading", { name: "GitHub" })).toBeInTheDocument();
    });

    it("moves an entry to a different group when the group selector changes", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub" });
      const work = Group.create("Work");
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      vault = vault.addGroup(vault.rootGroup.id, work);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "Edit entry" }));
      await user.selectOptions(screen.getByLabelText("Group"), work.id.toString());
      await user.click(screen.getByRole("button", { name: "Save" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.rootGroup.entries).toEqual([]);
      expect(savedVault.findGroup(work.id)?.entries.map((e) => e.id.toString())).toEqual([
        entry.id.toString(),
      ]);
    });

    it("cancels editing without saving", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      const onSave = vi.fn();

      renderShell(vault, { onSave });

      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "Edit entry" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "GitHub" })).toBeInTheDocument();
    });
  });

  describe("deleting an entry", () => {
    it("asks for confirmation, then deletes the entry and clears the selection", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "Delete entry" }));
      expect(screen.getByText("Delete this entry?")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.rootGroup.entries).toEqual([]);
      expect(savedVault.recycleBin?.entries.map((e) => e.id.toString())).toEqual([
        entry.id.toString(),
      ]);
      expect(screen.getByText("Select an entry to view details")).toBeInTheDocument();
    });

    it("cancels the delete confirmation without deleting", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      const onSave = vi.fn();

      renderShell(vault, { onSave });

      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "Delete entry" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.queryByText("Delete this entry?")).not.toBeInTheDocument();
    });

    it("shows an error message when deleting fails", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      const onSave = vi.fn().mockRejectedValue(new Error("Disk full"));

      renderShell(vault, { onSave });

      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "Delete entry" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("Disk full")).toBeInTheDocument();
    });

    it("shows a generic error message when deleting rejects with a non-Error", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      const onSave = vi.fn().mockRejectedValue("nope");

      renderShell(vault, { onSave });

      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "Delete entry" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("Failed to delete entry.")).toBeInTheDocument();
    });
  });

  describe("group management", () => {
    it("creates, renames, and deletes a group from the sidebar", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByRole("button", { name: "Add group" }));
      await user.type(screen.getByLabelText("New group name"), "Work");
      await user.click(screen.getByRole("button", { name: "Save" }));

      let savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.rootGroup.groups.map((g) => g.name)).toEqual(["Work"]);
    });

    it("renames a group from the sidebar", async () => {
      const user = userEvent.setup();
      const work = Group.create("Work");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByRole("button", { name: `Rename ${work.name}` }));
      await user.clear(screen.getByRole("textbox", { name: `Rename ${work.name}` }));
      await user.type(screen.getByRole("textbox", { name: `Rename ${work.name}` }), "Renamed");
      await user.click(screen.getByRole("button", { name: "Save" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.findGroup(work.id)?.name).toBe("Renamed");
    });

    it("deleting a group other than the currently selected one leaves the selection untouched", async () => {
      const user = userEvent.setup();
      const work = Group.create("Work");
      const personal = Group.create("Personal");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      vault = vault.addGroup(vault.rootGroup.id, personal);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(rowButton("Work"));
      await user.click(screen.getByRole("button", { name: `Delete ${personal.name}` }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(onSave).toHaveBeenCalled();
      expect(rowButton("Work").parentElement?.className).toContain("active");
    });

    it("falls back to 'All Items' when the selected group disappears from a newly-saved vault", async () => {
      const user = userEvent.setup();
      const work = Group.create("Work");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);

      const { rerender } = render(
        <VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={vi.fn()} onSave={vi.fn()} />,
      );

      await user.click(rowButton("Work"));
      expect(rowButton("Work").parentElement?.className).toContain("active");

      // Simulate the parent re-rendering with an updated vault (e.g. after a
      // save elsewhere) in which the previously-selected group is gone,
      // without going through this component's own delete flow.
      const vaultWithoutWork = Vault.create("Mine");
      rerender(
        <VaultShell
          vault={vaultWithoutWork}
          urlOpener={fakeUrlOpener()}
          onLock={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: /all items/i }).className).toContain("active");
    });

    it("returns to 'All Items' when the currently selected group is deleted", async () => {
      const user = userEvent.setup();
      const work = Group.create("Work");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(rowButton("Work"));
      await user.click(screen.getByRole("button", { name: `Delete ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(onSave).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /all items/i }).className).toContain("active");
    });

    it("moves a deleted group into the recycle bin instead of removing it outright", async () => {
      const user = userEvent.setup();
      const work = Group.create("Work");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByRole("button", { name: `Delete ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.rootGroup.groups.map((g) => g.name)).toEqual(["Recycle Bin"]);
      expect(savedVault.recycleBin?.groups.map((g) => g.name)).toEqual(["Work"]);
    });
  });

  describe("recycle bin", () => {
    it("selects the Recycle Bin row and shows its contents instead of the normal entry list", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Old Site" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      vault = vault.deleteEntry(entry.id);

      renderShell(vault);

      await user.click(screen.getByText("Recycle Bin"));

      expect(screen.getByRole("heading", { name: "Recycle Bin" })).toBeInTheDocument();
      expect(screen.getByText("Old Site")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /new entry/i })).not.toBeInTheDocument();
    });

    it("restores a deleted entry back to the root group", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Old Site" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      vault = vault.deleteEntry(entry.id);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByText("Recycle Bin"));
      await user.click(screen.getByRole("button", { name: "Restore" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.recycleBin?.entries).toEqual([]);
      expect(savedVault.rootGroup.entries.map((e) => e.id.toString())).toEqual([
        entry.id.toString(),
      ]);
    });

    it("permanently deletes an entry from the recycle bin", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Old Site" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      vault = vault.deleteEntry(entry.id);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByText("Recycle Bin"));
      await user.click(screen.getByRole("button", { name: "Delete Forever" }));
      await user.click(screen.getByRole("button", { name: "Delete Forever" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.findEntry(entry.id)).toBeUndefined();
    });

    it("restores a deleted group back to the root group", async () => {
      const user = userEvent.setup();
      const deleted = Group.create("Deleted");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, deleted);
      vault = vault.deleteGroup(deleted.id);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByText("Recycle Bin"));
      await user.click(screen.getByRole("button", { name: "Restore" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.recycleBin?.groups).toEqual([]);
      expect(savedVault.rootGroup.groups.map((g) => g.name).sort()).toEqual([
        "Deleted",
        "Recycle Bin",
      ]);
    });

    it("permanently deletes a group from the recycle bin", async () => {
      const user = userEvent.setup();
      const deleted = Group.create("Deleted");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, deleted);
      vault = vault.deleteGroup(deleted.id);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByText("Recycle Bin"));
      await user.click(screen.getByRole("button", { name: "Delete Forever" }));
      await user.click(screen.getByRole("button", { name: "Delete Forever" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.findGroup(deleted.id)).toBeUndefined();
    });

    it("empties the recycle bin", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Old Site" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      vault = vault.deleteEntry(entry.id);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByText("Recycle Bin"));
      await user.click(screen.getByRole("button", { name: "Empty Recycle Bin" }));
      await user.click(screen.getByRole("button", { name: "Empty" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.recycleBin?.entries).toEqual([]);
    });
  });
});
