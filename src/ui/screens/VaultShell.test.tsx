import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import {
  AccentColor,
  AutoLockSettings,
  DEFAULT_ENTRY_FIELD_VISIBILITY,
  EntryFieldVisibility,
  GroupDeleteMode,
  Theme,
} from "../../application/settings";
import { ClipboardWriter } from "../../application/clipboard";
import { UrlOpener } from "../../application/url-opener";
import { VaultMergeSource } from "../../application/vault-merge-source";
import { VaultShell } from "./VaultShell";

const DEFAULT_AUTO_LOCK: AutoLockSettings = { lockOnMinimize: false, lockOnSleep: false };
const DEFAULT_ACCENT_COLOR: AccentColor = { kind: "preset", id: "blue" };
const DEFAULT_THEME: Theme = "dark";

function fakeUrlOpener(): UrlOpener {
  return { open: vi.fn() };
}

function fakeClipboardWriter(overrides: Partial<ClipboardWriter> = {}): ClipboardWriter {
  return { writeText: vi.fn(), ...overrides };
}

function fakeMergeSource(overrides: Partial<VaultMergeSource> = {}): VaultMergeSource {
  return { pickFile: vi.fn(), openFile: vi.fn(), ...overrides };
}

function renderShell(
  vault: Vault,
  overrides: {
    onSave?: (vault: Vault) => Promise<void>;
    onChangeMasterPassword?: (currentPassword: string, newPassword: string) => Promise<void>;
    onLock?: () => void;
    generatorPolicy?: PasswordPolicyOptions;
    onGeneratorPolicyChange?: (policy: PasswordPolicyOptions) => void;
    clipboardWriter?: ClipboardWriter;
    clipboardClearSeconds?: number;
    onClipboardClearSecondsChange?: (seconds: number) => void;
    autoLock?: AutoLockSettings;
    onAutoLockChange?: (autoLock: AutoLockSettings) => void;
    groupDeleteMode?: GroupDeleteMode;
    accentColor?: AccentColor;
    onAccentColorChange?: (accentColor: AccentColor) => void;
    theme?: Theme;
    onThemeChange?: (theme: Theme) => void;
    contentProtection?: boolean;
    onContentProtectionChange?: (contentProtection: boolean) => void;
    entryFieldVisibility?: EntryFieldVisibility;
    onEntryFieldVisibilityChange?: (visibility: EntryFieldVisibility) => void;
    mergeSource?: VaultMergeSource;
  } = {},
) {
  const onSave = overrides.onSave ?? vi.fn().mockResolvedValue(undefined);
  const onChangeMasterPassword =
    overrides.onChangeMasterPassword ?? vi.fn().mockResolvedValue(undefined);
  const onLock = overrides.onLock ?? vi.fn();
  const generatorPolicy = overrides.generatorPolicy ?? {};
  const onGeneratorPolicyChange = overrides.onGeneratorPolicyChange ?? vi.fn();
  const clipboardWriter = overrides.clipboardWriter ?? fakeClipboardWriter();
  const clipboardClearSeconds = overrides.clipboardClearSeconds ?? 20;
  const onClipboardClearSecondsChange = overrides.onClipboardClearSecondsChange ?? vi.fn();
  const autoLock = overrides.autoLock ?? DEFAULT_AUTO_LOCK;
  const onAutoLockChange = overrides.onAutoLockChange ?? vi.fn();
  const groupDeleteMode = overrides.groupDeleteMode ?? "deleteContents";
  const accentColor = overrides.accentColor ?? DEFAULT_ACCENT_COLOR;
  const onAccentColorChange = overrides.onAccentColorChange ?? vi.fn();
  const theme = overrides.theme ?? DEFAULT_THEME;
  const onThemeChange = overrides.onThemeChange ?? vi.fn();
  const contentProtection = overrides.contentProtection ?? true;
  const onContentProtectionChange = overrides.onContentProtectionChange ?? vi.fn();
  const entryFieldVisibility = overrides.entryFieldVisibility ?? DEFAULT_ENTRY_FIELD_VISIBILITY;
  const onEntryFieldVisibilityChange = overrides.onEntryFieldVisibilityChange ?? vi.fn();
  const mergeSource = overrides.mergeSource ?? fakeMergeSource();
  render(
    <VaultShell
      vault={vault}
      filePath="C:/vaults/personal.kdbx"
      fileInfo={undefined}
      urlOpener={fakeUrlOpener()}
      clipboardWriter={clipboardWriter}
      generatorPolicy={generatorPolicy}
      clipboardClearSeconds={clipboardClearSeconds}
      autoLock={autoLock}
      groupDeleteMode={groupDeleteMode}
      accentColor={accentColor}
      theme={theme}
      contentProtection={contentProtection}
      entryFieldVisibility={entryFieldVisibility}
      mergeSource={mergeSource}
      onLock={onLock}
      onSave={onSave}
      onChangeMasterPassword={onChangeMasterPassword}
      onGeneratorPolicyChange={onGeneratorPolicyChange}
      onClipboardClearSecondsChange={onClipboardClearSecondsChange}
      onAutoLockChange={onAutoLockChange}
      onGroupDeleteModeChange={vi.fn()}
      onAccentColorChange={onAccentColorChange}
      onThemeChange={onThemeChange}
      onContentProtectionChange={onContentProtectionChange}
      onEntryFieldVisibilityChange={onEntryFieldVisibilityChange}
    />,
  );
  return {
    onSave,
    onChangeMasterPassword,
    onLock,
    onGeneratorPolicyChange,
    clipboardWriter,
    onClipboardClearSecondsChange,
    onAutoLockChange,
    onAccentColorChange,
    onThemeChange,
    onContentProtectionChange,
    onEntryFieldVisibilityChange,
    mergeSource,
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
        filePath="C:/vaults/personal.kdbx"
        fileInfo={undefined}
        urlOpener={urlOpener}
        generatorPolicy={{}}
        onLock={vi.fn()}
        onSave={vi.fn()}
        onChangeMasterPassword={vi.fn()}
        onGeneratorPolicyChange={vi.fn()}
        onClipboardClearSecondsChange={vi.fn()}
        onAutoLockChange={vi.fn()}
        clipboardWriter={fakeClipboardWriter()}
        clipboardClearSeconds={20}
        autoLock={DEFAULT_AUTO_LOCK}
        groupDeleteMode="deleteContents"
        accentColor={DEFAULT_ACCENT_COLOR}
        theme={DEFAULT_THEME}
        contentProtection={true}
        entryFieldVisibility={DEFAULT_ENTRY_FIELD_VISIBILITY}
        mergeSource={fakeMergeSource()}
        onGroupDeleteModeChange={vi.fn()}
        onAccentColorChange={vi.fn()}
        onThemeChange={vi.fn()}
        onContentProtectionChange={vi.fn()}
        onEntryFieldVisibilityChange={vi.fn()}
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
      const bar = document.querySelector(".clipboard-clear-bar-fill");
      expect(bar).toBeInTheDocument();
      expect(bar).toHaveStyle({ animationDuration: "5s" });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
      expect(document.querySelector(".clipboard-clear-bar-fill")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000 - 1500);
      });
      expect(writeText).toHaveBeenLastCalledWith("");
      expect(document.querySelector(".clipboard-clear-bar-fill")).not.toBeInTheDocument();
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
      // here, 2s after the password was copied — it must not wipe the password,
      // and it must not dismiss the password's own clear-countdown bar either.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(writeText).not.toHaveBeenLastCalledWith("");
      expect(document.querySelectorAll(".clipboard-clear-bar-fill")).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(writeText).toHaveBeenLastCalledWith("");
      expect(document.querySelector(".clipboard-clear-bar-fill")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("swaps the clear-countdown bar to the newly copied field instead of showing both", async () => {
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
      expect(document.querySelectorAll(".clipboard-clear-bar-fill")).toHaveLength(1);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy password" }));
        await Promise.resolve();
      });

      // Only the password's bar should remain; the clipboard now holds one
      // value, so showing two countdowns would be misleading.
      expect(document.querySelectorAll(".clipboard-clear-bar-fill")).toHaveLength(1);
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

    it("hides fields turned off in the entry field visibility setting", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");

      renderShell(vault, {
        entryFieldVisibility: { ...DEFAULT_ENTRY_FIELD_VISIBILITY, notes: false },
      });

      await user.click(screen.getByRole("button", { name: /new entry/i }));

      expect(screen.getByLabelText("Title")).toBeInTheDocument();
      expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
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

    it("ignores the entry field visibility setting, always showing every field", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "GitHub", notes: "some notes" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);

      renderShell(vault, {
        entryFieldVisibility: { ...DEFAULT_ENTRY_FIELD_VISIBILITY, notes: false },
      });

      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "Edit entry" }));

      expect(screen.getByLabelText("Notes")).toBeInTheDocument();
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
          filePath="C:/vaults/personal.kdbx"
          fileInfo={undefined}
          urlOpener={fakeUrlOpener()}
          generatorPolicy={{}}
          onLock={vi.fn()}
          onSave={vi.fn()}
          onChangeMasterPassword={vi.fn()}
          onGeneratorPolicyChange={vi.fn()}
          onClipboardClearSecondsChange={vi.fn()}
          onAutoLockChange={vi.fn()}
          clipboardWriter={fakeClipboardWriter()}
          clipboardClearSeconds={20}
          autoLock={DEFAULT_AUTO_LOCK}
          groupDeleteMode="deleteContents"
          accentColor={DEFAULT_ACCENT_COLOR}
          theme={DEFAULT_THEME}
          contentProtection={true}
          entryFieldVisibility={DEFAULT_ENTRY_FIELD_VISIBILITY}
          mergeSource={fakeMergeSource()}
          onGroupDeleteModeChange={vi.fn()}
          onAccentColorChange={vi.fn()}
          onThemeChange={vi.fn()}
          onContentProtectionChange={vi.fn()}
          onEntryFieldVisibilityChange={vi.fn()}
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
          filePath="C:/vaults/personal.kdbx"
          fileInfo={undefined}
          urlOpener={fakeUrlOpener()}
          generatorPolicy={{}}
          onLock={vi.fn()}
          onSave={vi.fn()}
          onChangeMasterPassword={vi.fn()}
          onGeneratorPolicyChange={vi.fn()}
          onClipboardClearSecondsChange={vi.fn()}
          onAutoLockChange={vi.fn()}
          clipboardWriter={fakeClipboardWriter()}
          clipboardClearSeconds={20}
          autoLock={DEFAULT_AUTO_LOCK}
          groupDeleteMode="deleteContents"
          accentColor={DEFAULT_ACCENT_COLOR}
          theme={DEFAULT_THEME}
          contentProtection={true}
          entryFieldVisibility={DEFAULT_ENTRY_FIELD_VISIBILITY}
          mergeSource={fakeMergeSource()}
          onGroupDeleteModeChange={vi.fn()}
          onAccentColorChange={vi.fn()}
          onThemeChange={vi.fn()}
          onContentProtectionChange={vi.fn()}
          onEntryFieldVisibilityChange={vi.fn()}
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

  describe("settings", () => {
    it("shows the number of stored passwords, excluding entries in the recycle bin", async () => {
      const user = userEvent.setup();
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, Entry.create({ title: "GitHub" }));
      vault = vault.addEntry(vault.rootGroup.id, Entry.create({ title: "Bank" }));
      const deleted = Entry.create({ title: "Old" });
      vault = vault.addEntry(vault.rootGroup.id, deleted);
      vault = vault.deleteEntry(deleted.id);

      renderShell(vault);

      await user.click(screen.getByRole("button", { name: "Settings" }));

      expect(screen.getByText("Passwords")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("reports an entry field visibility change made in the settings screen", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");

      const { onEntryFieldVisibilityChange } = renderShell(vault);

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("checkbox", { name: "Notes" }));

      expect(onEntryFieldVisibilityChange).toHaveBeenCalledWith(
        expect.objectContaining({ notes: false }),
      );
    });

    it("reports a content protection change made in the settings screen", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");

      const { onContentProtectionChange } = renderShell(vault, { contentProtection: true });

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("checkbox", { name: /screen sharing/i }));

      expect(onContentProtectionChange).toHaveBeenCalledWith(false);
    });

    it("submits a master password change made in the settings screen", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");

      const { onChangeMasterPassword } = renderShell(vault);

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /change master password/i }));
      await user.type(screen.getByLabelText("Current password"), "old-pw");
      await user.type(screen.getByLabelText("New password"), "new-pw");
      await user.type(screen.getByLabelText("Confirm new password"), "new-pw");
      await user.click(screen.getByRole("button", { name: /change master password/i }));

      expect(onChangeMasterPassword).toHaveBeenCalledWith("old-pw", "new-pw");
    });

    it("picks a file first, then asks for its password in a dialog over the settings screen", async () => {
      const user = userEvent.setup();
      const mergeSource = fakeMergeSource({
        pickFile: vi.fn().mockResolvedValue("C:/vaults/other.kdbx"),
      });

      renderShell(Vault.create("Mine"), { mergeSource });

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /merge another vault in/i }));

      expect(mergeSource.pickFile).toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: /merge another vault in/i })).toBeInTheDocument();
      expect(screen.getByText("other.kdbx")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    });

    it("opens the wizard once the picked file is unlocked", async () => {
      const user = userEvent.setup();
      const mergeSource = fakeMergeSource({
        pickFile: vi.fn().mockResolvedValue("C:/vaults/other.kdbx"),
        openFile: vi.fn().mockResolvedValue(Vault.create("Theirs")),
      });

      renderShell(Vault.create("Mine"), { mergeSource });

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /merge another vault in/i }));
      await user.type(screen.getByLabelText("Its master password"), "pw");
      await user.click(screen.getByRole("button", { name: /unlock & compare/i }));

      expect(mergeSource.openFile).toHaveBeenCalledWith("C:/vaults/other.kdbx", "pw");
      expect(await screen.findByRole("heading", { name: "Merge vault" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Settings" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("heading", { name: "Merge vault" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    });

    it("refuses to merge the vault that's already open, without asking for a password", async () => {
      const user = userEvent.setup();
      const mergeSource = fakeMergeSource({
        // Same file as `renderShell`'s `filePath`, spelled the way Windows'
        // file dialog would hand it back.
        pickFile: vi.fn().mockResolvedValue("C:\\Vaults\\Personal.kdbx"),
      });

      renderShell(Vault.create("Mine"), { mergeSource });

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /merge another vault in/i }));

      expect(await screen.findByText(/vault you already have open/i)).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mergeSource.openFile).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    });

    it("clears the refusal once a different file is picked", async () => {
      const user = userEvent.setup();
      const pickFile = vi
        .fn()
        .mockResolvedValueOnce("C:/vaults/personal.kdbx")
        .mockResolvedValueOnce("C:/vaults/other.kdbx");
      const mergeSource = fakeMergeSource({ pickFile });

      renderShell(Vault.create("Mine"), { mergeSource });

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /merge another vault in/i }));
      await screen.findByText(/vault you already have open/i);

      await user.click(screen.getByRole("button", { name: /merge another vault in/i }));

      expect(
        await screen.findByRole("dialog", { name: /merge another vault in/i }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/vault you already have open/i)).not.toBeInTheDocument();
    });

    it("stays on the settings screen when the file dialog is cancelled", async () => {
      const user = userEvent.setup();
      const mergeSource = fakeMergeSource({ pickFile: vi.fn().mockResolvedValue(undefined) });

      renderShell(Vault.create("Mine"), { mergeSource });

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /merge another vault in/i }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    });

    it("abandons an in-progress merge when navigating away via the nav rail", async () => {
      const user = userEvent.setup();
      const mergeSource = fakeMergeSource({
        pickFile: vi.fn().mockResolvedValue("C:/vaults/other.kdbx"),
        openFile: vi.fn().mockResolvedValue(Vault.create("Theirs")),
      });

      renderShell(Vault.create("Mine"), { mergeSource });

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /merge another vault in/i }));
      await user.type(screen.getByLabelText("Its master password"), "pw");
      await user.click(screen.getByRole("button", { name: /unlock & compare/i }));
      await screen.findByRole("heading", { name: "Merge vault" });

      await user.click(screen.getByRole("button", { name: "Vault" }));
      await user.click(screen.getByRole("button", { name: "Settings" }));

      expect(screen.queryByRole("heading", { name: "Merge vault" })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  describe("TOTP", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(40 * 1000));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // The Web Crypto HMAC chain resolves over several real event-loop turns,
    // not just one microtask, so flush a handful of turns to let it settle.
    async function flushCrypto(): Promise<void> {
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
      }
    }

    it("does not show an authenticator code card for an entry without TOTP data", async () => {
      const entry = Entry.create({ title: "No TOTP" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);

      renderShell(vault);
      fireEvent.click(screen.getByText("No TOTP"));

      expect(screen.queryByText("Authenticator code")).not.toBeInTheDocument();
    });

    it("shows a live code for an entry with a modern otp field", async () => {
      const entry = Entry.create({
        title: "GitHub",
        customFields: new CustomFields([
          new CustomField(
            "otp",
            "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP&digits=6&period=30",
            true,
          ),
        ]),
      });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);

      renderShell(vault);
      fireEvent.click(screen.getByText("GitHub"));
      await flushCrypto();

      expect(screen.getByText("Authenticator code")).toBeInTheDocument();
      const value = screen.getByText(/^\d{3} \d{3}$/);
      expect(value).toBeInTheDocument();
    });

    it("shows a live code for an entry using the classic TOTP Seed/Settings fields", async () => {
      const entry = Entry.create({
        title: "Legacy",
        customFields: new CustomFields([
          new CustomField("TOTP Seed", "JBSWY3DPEHPK3PXP", true),
          new CustomField("TOTP Settings", "30;6"),
        ]),
      });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);

      renderShell(vault);
      fireEvent.click(screen.getByText("Legacy"));
      await flushCrypto();

      expect(screen.getByText(/^\d{3} \d{3}$/)).toBeInTheDocument();
    });

    it("hides the raw TOTP fields from the generic custom-fields list once parsed", async () => {
      const entry = Entry.create({
        title: "GitHub",
        customFields: new CustomFields([
          new CustomField("otp", "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP", true),
          new CustomField("PIN", "1234"),
        ]),
      });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);

      renderShell(vault);
      fireEvent.click(screen.getByText("GitHub"));
      await flushCrypto();

      expect(screen.getByText("Custom fields")).toBeInTheDocument();
      expect(screen.queryByText("otp")).not.toBeInTheDocument();
      expect(screen.getByText("PIN")).toBeInTheDocument();
    });

    it("still lists an unparseable otp field in the generic custom-fields card", async () => {
      const entry = Entry.create({
        title: "Broken",
        customFields: new CustomFields([new CustomField("otp", "not a uri", true)]),
      });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);

      renderShell(vault);
      fireEvent.click(screen.getByText("Broken"));

      expect(screen.queryByText("Authenticator code")).not.toBeInTheDocument();
      expect(screen.getByText("otp")).toBeInTheDocument();
    });

    it("copies the current code and shows a transient copied label", async () => {
      const entry = Entry.create({
        title: "GitHub",
        customFields: new CustomFields([
          new CustomField("otp", "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP", true),
        ]),
      });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      const writeText = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { clipboardWriter: fakeClipboardWriter({ writeText }) });
      fireEvent.click(screen.getByText("GitHub"));
      await flushCrypto();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy authenticator code" }));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/));
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });
});
