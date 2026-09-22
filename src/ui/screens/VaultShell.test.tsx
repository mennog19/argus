import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CustomField,
  CustomFields,
  Entry,
  Group,
  Icon,
  Password,
  PasswordPolicyOptions,
  Tag,
  Tags,
  Vault,
} from "../../domain";
import { AutoLockSettings, GroupDeleteMode } from "../../application/settings";
import { ClipboardWriter } from "../../application/clipboard";
import { UrlOpener } from "../../application/url-opener";
import { VaultShell } from "./VaultShell";

const DEFAULT_AUTO_LOCK: AutoLockSettings = { lockOnMinimize: false, lockOnSleep: false };

function fakeUrlOpener(): UrlOpener {
  return { open: vi.fn() };
}

function fakeClipboardWriter(overrides: Partial<ClipboardWriter> = {}): ClipboardWriter {
  return { writeText: vi.fn(), ...overrides };
}

function renderShell(
  vault: Vault,
  overrides: {
    onSave?: (vault: Vault) => Promise<void>;
    onLock?: () => void;
    generatorPolicy?: PasswordPolicyOptions;
    onGeneratorPolicyChange?: (policy: PasswordPolicyOptions) => void;
    clipboardWriter?: ClipboardWriter;
    clipboardClearSeconds?: number;
    onClipboardClearSecondsChange?: (seconds: number) => void;
    autoLock?: AutoLockSettings;
    onAutoLockChange?: (autoLock: AutoLockSettings) => void;
    groupDeleteMode?: GroupDeleteMode;
  } = {},
) {
  const onSave = overrides.onSave ?? vi.fn().mockResolvedValue(undefined);
  const onLock = overrides.onLock ?? vi.fn();
  const generatorPolicy = overrides.generatorPolicy ?? {};
  const onGeneratorPolicyChange = overrides.onGeneratorPolicyChange ?? vi.fn();
  const clipboardWriter = overrides.clipboardWriter ?? fakeClipboardWriter();
  const clipboardClearSeconds = overrides.clipboardClearSeconds ?? 20;
  const onClipboardClearSecondsChange = overrides.onClipboardClearSecondsChange ?? vi.fn();
  const autoLock = overrides.autoLock ?? DEFAULT_AUTO_LOCK;
  const onAutoLockChange = overrides.onAutoLockChange ?? vi.fn();
  const groupDeleteMode = overrides.groupDeleteMode ?? "deleteContents";
  render(
    <VaultShell
      vault={vault}
      urlOpener={fakeUrlOpener()}
      clipboardWriter={clipboardWriter}
      generatorPolicy={generatorPolicy}
      clipboardClearSeconds={clipboardClearSeconds}
      autoLock={autoLock}
      groupDeleteMode={groupDeleteMode}
      onLock={onLock}
      onSave={onSave}
      onGeneratorPolicyChange={onGeneratorPolicyChange}
      onClipboardClearSecondsChange={onClipboardClearSecondsChange}
      onAutoLockChange={onAutoLockChange}
      onGroupDeleteModeChange={vi.fn()}
    />,
  );
  return {
    onSave,
    onLock,
    onGeneratorPolicyChange,
    clipboardWriter,
    onClipboardClearSecondsChange,
    onAutoLockChange,
  };
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

  it("searches across all groups by title/username/URL/notes/tags/custom fields, case-insensitively", async () => {
    const user = userEvent.setup();
    const github = Entry.create({ title: "GitHub", username: "octocat" });
    const work = Group.create("Work").addEntry(
      Entry.create({ title: "Internal Tool", notes: "shared github mirror" }),
    );
    const other = Entry.create({ title: "Mail" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, github);
    vault = vault.addEntry(vault.rootGroup.id, other);
    vault = vault.addGroup(vault.rootGroup.id, work);

    renderShell(vault);
    // Narrow to a single group first, to prove search overrides group scope.
    await user.click(rowButton("Work"));

    await user.type(screen.getByLabelText("Search entries"), "GITHUB");

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Internal Tool")).toBeInTheDocument();
    expect(screen.queryByText("Mail")).not.toBeInTheDocument();
  });

  it("shows a no-match message while searching, and clears the search via the clear button", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({ title: "GitHub" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    renderShell(vault);

    await user.type(screen.getByLabelText("Search entries"), "nonexistent");
    expect(screen.getByText('No entries match "nonexistent".')).toBeInTheDocument();
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByLabelText("Search entries")).toHaveValue("");
  });

  it("clears the search query when switching groups", async () => {
    const user = userEvent.setup();
    const work = Group.create("Work").addEntry(Entry.create({ title: "Work Entry" }));
    let vault = Vault.create("Mine");
    vault = vault.addGroup(vault.rootGroup.id, work);

    renderShell(vault);

    await user.type(screen.getByLabelText("Search entries"), "something");
    await user.click(rowButton("Work"));

    expect(screen.getByLabelText("Search entries")).toHaveValue("");
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

    render(
      <VaultShell
        vault={vault}
        urlOpener={urlOpener}
        generatorPolicy={{}}
        onLock={vi.fn()}
        onSave={vi.fn()}
        onGeneratorPolicyChange={vi.fn()}
        onClipboardClearSecondsChange={vi.fn()}
        onAutoLockChange={vi.fn()}
        clipboardWriter={fakeClipboardWriter()}
        clipboardClearSeconds={20}
        autoLock={DEFAULT_AUTO_LOCK}
        groupDeleteMode="deleteContents"
        onGroupDeleteModeChange={vi.fn()}
      />,
    );

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

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.queryByText("••••••••")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByText("••••••••")).toBeInTheDocument();
  });

  it("copies the username, shows a transient copied label, and clears the clipboard after the configured delay", async () => {
    const entry = Entry.create({ title: "GitHub", username: "octocat" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.useFakeTimers();
    try {
      renderShell(vault, {
        clipboardWriter: fakeClipboardWriter({ writeText }),
        clipboardClearSeconds: 5,
      });
      fireEvent.click(screen.getByText("GitHub"));

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy username" }));
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledWith("octocat");
      expect(screen.getByText("Copied")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000 - 1500);
      });
      expect(writeText).toHaveBeenLastCalledWith("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("copies the revealed password value", async () => {
    const entry = Entry.create({ title: "GitHub", password: new Password("s3cret!") });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderShell(vault, { clipboardWriter: fakeClipboardWriter({ writeText }) });
    await user.click(screen.getByText("GitHub"));
    await user.click(screen.getByRole("button", { name: "Copy password" }));

    expect(writeText).toHaveBeenCalledWith("s3cret!");
  });

  it("does not clear the clipboard from a stale copy once a newer value has been copied", async () => {
    const entry = Entry.create({
      title: "GitHub",
      username: "octocat",
      password: new Password("s3cret!"),
    });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.useFakeTimers();
    try {
      renderShell(vault, {
        clipboardWriter: fakeClipboardWriter({ writeText }),
        clipboardClearSeconds: 5,
      });
      fireEvent.click(screen.getByText("GitHub"));

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy username" }));
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy password" }));
        await Promise.resolve();
      });

      // The username's own clear timer (fires at 5s after its own copy) lands
      // here, 2s after the password was copied — it must not wipe the password.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(writeText).not.toHaveBeenLastCalledWith("");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(writeText).toHaveBeenLastCalledWith("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the copied-label change from a newer copy even if an older copy's label timer fires later", async () => {
    const entry = Entry.create({
      title: "GitHub",
      username: "octocat",
      password: new Password("s3cret!"),
    });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    vi.useFakeTimers();
    try {
      renderShell(vault);
      fireEvent.click(screen.getByText("GitHub"));

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy username" }));
        await Promise.resolve();
        fireEvent.click(screen.getByRole("button", { name: "Copy password" }));
        await Promise.resolve();
      });

      // Both copies' 1.5s label timers land here at the same instant: the
      // username copy's timer runs first (scheduled first) and must not
      // clear a label that now belongs to the password copy.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets the selected entry and reveal state when switching groups", async () => {
    const user = userEvent.setup();
    const rootEntry = Entry.create({ title: "Root Entry" });
    const work = Group.create("Work").addEntry(Entry.create({ title: "Payroll" }));
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

      expect(await screen.findByText("nope")).toBeInTheDocument();
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

      await user.click(screen.getByRole("button", { name: `More actions for ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Rename" }));
      await user.clear(screen.getByRole("textbox", { name: `Rename ${work.name}` }));
      await user.type(screen.getByRole("textbox", { name: `Rename ${work.name}` }), "Renamed");
      await user.click(screen.getByRole("button", { name: "Save" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.findGroup(work.id)?.name).toBe("Renamed");
    });

    it("changes a group's icon from the sidebar", async () => {
      const user = userEvent.setup();
      const work = Group.create("Work");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      await user.click(screen.getByRole("button", { name: `More actions for ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Change icon" }));
      await user.click(screen.getByRole("button", { name: "Star" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.findGroup(work.id)?.icon.equals(Icon.library("star"))).toBe(true);
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
      await user.click(screen.getByRole("button", { name: `More actions for ${personal.name}` }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
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
        <VaultShell
          vault={vault}
          urlOpener={fakeUrlOpener()}
          generatorPolicy={{}}
          onLock={vi.fn()}
          onSave={vi.fn()}
          onGeneratorPolicyChange={vi.fn()}
          onClipboardClearSecondsChange={vi.fn()}
          onAutoLockChange={vi.fn()}
          clipboardWriter={fakeClipboardWriter()}
          clipboardClearSeconds={20}
          autoLock={DEFAULT_AUTO_LOCK}
          groupDeleteMode="deleteContents"
          onGroupDeleteModeChange={vi.fn()}
        />,
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
          generatorPolicy={{}}
          onLock={vi.fn()}
          onSave={vi.fn()}
          onGeneratorPolicyChange={vi.fn()}
          onClipboardClearSecondsChange={vi.fn()}
          onAutoLockChange={vi.fn()}
          clipboardWriter={fakeClipboardWriter()}
          clipboardClearSeconds={20}
          autoLock={DEFAULT_AUTO_LOCK}
          groupDeleteMode="deleteContents"
          onGroupDeleteModeChange={vi.fn()}
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
      await user.click(screen.getByRole("button", { name: `More actions for ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
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

      await user.click(screen.getByRole("button", { name: `More actions for ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.rootGroup.groups.map((g) => g.name)).toEqual(["Recycle Bin"]);
      expect(savedVault.recycleBin?.groups.map((g) => g.name)).toEqual(["Work"]);
    });

    it("keeps a deleted group's entries in its parent when the delete mode is keepContents", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Bank" });
      const work = Group.create("Work").addEntry(entry);
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave, groupDeleteMode: "keepContents" });

      await user.click(screen.getByRole("button", { name: `More actions for ${work.name}` }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.rootGroup.entries.map((e) => e.title)).toEqual(["Bank"]);
      expect(savedVault.recycleBin?.groups.map((g) => g.name)).toEqual(["Work"]);
      expect(savedVault.recycleBin?.groups[0].entries).toEqual([]);
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

  describe("password generator", () => {
    it("switches to the generator screen and back to the vault via the nav rail", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);

      renderShell(vault);

      await user.click(screen.getByRole("button", { name: "Password generator" }));

      expect(screen.getByRole("heading", { name: "Password Generator" })).toBeInTheDocument();
      expect(screen.queryByText("GitHub")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Vault" }));

      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });

    it("persists a generator policy change made on the generator screen", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");

      const { onGeneratorPolicyChange } = renderShell(vault, {
        generatorPolicy: { length: 16 },
      });

      await user.click(screen.getByRole("button", { name: "Password generator" }));
      await user.click(screen.getByRole("button", { name: "Passphrase" }));

      expect(onGeneratorPolicyChange).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "passphrase" }),
      );
    });

    it("passes the shared generator policy through to the entry form's Generate button", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");

      renderShell(vault, { generatorPolicy: { length: 10, useSymbols: false } });

      await user.click(screen.getByRole("button", { name: /new entry/i }));
      await user.click(screen.getByRole("button", { name: "Generate" }));

      expect((screen.getByLabelText("Password") as HTMLInputElement).value).toHaveLength(10);
    });
  });

  describe("password health", () => {
    it("switches to the health screen and back to the vault via the nav rail", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub", password: new Password("Correct-Horse-7!") });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);

      renderShell(vault);

      await user.click(screen.getByRole("button", { name: "Password health" }));

      expect(screen.getByRole("heading", { name: "Password Health" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Vault" }));

      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });

    it("selecting a flagged entry on the health screen jumps back to it in the vault view", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Weak Site", password: new Password("abc") });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);

      renderShell(vault);

      await user.click(screen.getByRole("button", { name: "Password health" }));
      await user.click(screen.getByText("Weak Site"));

      expect(screen.getByRole("heading", { name: "Weak Site" })).toBeInTheDocument();
    });
  });
  describe("dragging an entry onto a group", () => {
    function buildVault() {
      const entry = Entry.create({ title: "Bank" });
      const work = Group.create("Work");
      const vault = new Vault("Root", Group.create("Root").addEntry(entry).addGroup(work));
      return { vault, entry, work };
    }

    function fakeTransfer() {
      const data = new Map<string, string>();
      return {
        types: [] as string[],
        effectAllowed: "all",
        dropEffect: "none",
        setData(type: string, value: string) {
          data.set(type, value);
          this.types.push(type);
        },
        getData: (type: string) => data.get(type) ?? "",
      };
    }

    function entryRow(title: string) {
      return screen.getByText(title).closest(".entry-row") as HTMLElement;
    }

    function groupRow(name: string) {
      return screen
        .getByRole("button", { name: new RegExp(`^${name}`) })
        .closest(".group-row") as HTMLElement;
    }

    it("marks the dragged entry and the group sidebar until the drag ends", () => {
      const { vault } = buildVault();
      renderShell(vault);
      const dataTransfer = fakeTransfer();

      fireEvent.dragStart(entryRow("Bank"), { dataTransfer });

      expect(dataTransfer.effectAllowed).toBe("move");
      expect(entryRow("Bank")).toHaveClass("dragging");
      expect(document.querySelector(".group-sidebar")).toHaveClass("entry-drag-active");

      fireEvent.dragEnd(entryRow("Bank"));

      expect(entryRow("Bank")).not.toHaveClass("dragging");
      expect(document.querySelector(".group-sidebar")).not.toHaveClass("entry-drag-active");
    });

    it("moves the entry into the group it's dropped on and saves", async () => {
      const { vault, entry, work } = buildVault();
      const { onSave } = renderShell(vault);
      const dataTransfer = fakeTransfer();

      fireEvent.dragStart(entryRow("Bank"), { dataTransfer });
      fireEvent.dragOver(groupRow("Work"), { dataTransfer });
      fireEvent.drop(groupRow("Work"), { dataTransfer });

      await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      const saved: Vault = vi.mocked(onSave).mock.calls[0][0];
      expect(saved.findGroup(work.id)?.entries.map((e) => e.id.toString())).toEqual([
        entry.id.toString(),
      ]);
      expect(saved.rootGroup.entries).toEqual([]);
    });

    it("doesn't save when the entry is dropped on the group it's already in", async () => {
      const entry = Entry.create({ title: "Bank" });
      const work = Group.create("Work").addEntry(entry);
      const vault = new Vault("Root", Group.create("Root").addGroup(work));
      const { onSave } = renderShell(vault);
      const dataTransfer = fakeTransfer();

      fireEvent.dragStart(entryRow("Bank"), { dataTransfer });
      fireEvent.drop(groupRow("Work"), { dataTransfer });

      await vi.waitFor(() => expect(groupRow("Work")).toHaveClass("drop-flash"));
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
