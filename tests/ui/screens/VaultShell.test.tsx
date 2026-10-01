import { SettingsImportResult } from "../../../src/application/settings-transfer-service";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Attachment,
  Attachments,
  CustomField,
  CustomFields,
  CustomIcon,
  CustomIcons,
  Entry,
  Group,
  Icon,
  Password,
  PasswordPolicyOptions,
  Tag,
  Tags,
  Vault,
} from "../../../src/domain";
import { MasterPasswordChangeResult } from "../../../src/application/vault-access-service";
import {
  AccentColor,
  AutoLockSettings,
  AutoTypeSettings,
  DEFAULT_ENTRY_FIELD_VISIBILITY,
  DEFAULT_ENTRY_SORT,
  EffectiveSettings,
  EntryFieldVisibility,
  EntrySortId,
  GroupDeleteMode,
  Theme,
} from "../../../src/application/settings";
import { ClipboardWriter } from "../../../src/application/clipboard";
import { DEFAULT_SHORTCUTS, ShortcutBindings } from "../../../src/application/shortcuts";
import { UrlOpener } from "../../../src/application/url-opener";
import { VaultMergeSource } from "../../../src/application/vault-merge-source";
import { GROUP_DRAG_TYPE } from "../../../src/ui/group-drag";
import { VaultShell } from "../../../src/ui/screens/VaultShell";
import { fakeVaultFileActions } from "../vault-file-fakes";
import { formatDateTime } from "../../../src/ui/format";

const DEFAULT_AUTO_LOCK: AutoLockSettings = {
  lockOnMinimize: false,
  lockOnSleep: false,
  lockOnSessionLock: false,
};
const DEFAULT_AUTO_TYPE: AutoTypeSettings = {
  enabled: false,
  hotkey: "CommandOrControl+Shift+A",
};
const DEFAULT_ACCENT_COLOR: AccentColor = { kind: "preset", id: "blue" };
const DEFAULT_THEME: Theme = "dark";

/** Everything at its default, for the renders that don't care about settings. */
const TEST_SETTINGS: EffectiveSettings = {
  generatorPolicy: {},
  clipboardClearSeconds: 20,
  autoLock: DEFAULT_AUTO_LOCK,
  autoType: DEFAULT_AUTO_TYPE,
  groupDeleteMode: "deleteContents",
  expiredEntryAction: "mark",
  accentColor: DEFAULT_ACCENT_COLOR,
  theme: DEFAULT_THEME,
  contentProtection: true,
  closeToTray: false,
  checkForUpdates: false,
  entryFieldVisibility: DEFAULT_ENTRY_FIELD_VISIBILITY,
  entrySort: DEFAULT_ENTRY_SORT,
  shortcuts: DEFAULT_SHORTCUTS,
};

function fakeUrlOpener(): UrlOpener {
  return { open: vi.fn() };
}

function fakeClipboardWriter(overrides: Partial<ClipboardWriter> = {}): ClipboardWriter {
  return { writeText: vi.fn(), clearIfUnchanged: vi.fn(), ...overrides };
}

function fakeMergeSource(overrides: Partial<VaultMergeSource> = {}): VaultMergeSource {
  return { pickFile: vi.fn(), pickKeyFile: vi.fn(), openFile: vi.fn(), ...overrides };
}

function renderShell(
  vault: Vault,
  overrides: {
    onSave?: (vault: Vault) => Promise<void>;
    onChangeMasterPassword?: (
      currentPassword: string,
      newPassword: string,
    ) => Promise<MasterPasswordChangeResult>;
    onLock?: () => void;
    onSettingChange?: (key: string, value: unknown) => void;
    clipboardWriter?: ClipboardWriter;
    generatorPolicy?: PasswordPolicyOptions;
    clipboardClearSeconds?: number;
    autoLock?: AutoLockSettings;
    groupDeleteMode?: GroupDeleteMode;
    accentColor?: AccentColor;
    theme?: Theme;
    contentProtection?: boolean;
    entryFieldVisibility?: EntryFieldVisibility;
    entrySort?: EntrySortId;
    shortcuts?: ShortcutBindings;
    urlOpener?: UrlOpener;
    onExportSettings?: () => Promise<string | undefined>;
    onImportSettings?: () => Promise<SettingsImportResult | undefined>;
    onVaultChange?: (vault: Vault) => void;
    onExportAttachment?: (attachment: Attachment) => Promise<string | undefined>;
    mergeSource?: VaultMergeSource;
  } = {},
) {
  const onSave = overrides.onSave ?? vi.fn().mockResolvedValue(undefined);
  const vaultFileActions = fakeVaultFileActions(
    overrides.onChangeMasterPassword && {
      onChangeMasterPassword: overrides.onChangeMasterPassword,
    },
  );
  const { onChangeMasterPassword } = vaultFileActions;
  const onLock = overrides.onLock ?? vi.fn();
  const onSettingChange = overrides.onSettingChange ?? vi.fn();
  const clipboardWriter = overrides.clipboardWriter ?? fakeClipboardWriter();
  const onExportSettings = overrides.onExportSettings ?? vi.fn().mockResolvedValue(undefined);
  const onImportSettings = overrides.onImportSettings ?? vi.fn().mockResolvedValue(undefined);
  const onVaultChange = overrides.onVaultChange ?? vi.fn();
  const onExportAttachment = overrides.onExportAttachment ?? vi.fn().mockResolvedValue(undefined);
  const mergeSource = overrides.mergeSource ?? fakeMergeSource();
  const urlOpener = overrides.urlOpener ?? fakeUrlOpener();
  // Flat overrides are this helper's own convenience; the shell itself takes
  // one resolved settings object.
  const settings: EffectiveSettings = {
    generatorPolicy: overrides.generatorPolicy ?? TEST_SETTINGS.generatorPolicy,
    clipboardClearSeconds: overrides.clipboardClearSeconds ?? TEST_SETTINGS.clipboardClearSeconds,
    autoLock: overrides.autoLock ?? TEST_SETTINGS.autoLock,
    autoType: TEST_SETTINGS.autoType,
    groupDeleteMode: overrides.groupDeleteMode ?? TEST_SETTINGS.groupDeleteMode,
    expiredEntryAction: TEST_SETTINGS.expiredEntryAction,
    accentColor: overrides.accentColor ?? TEST_SETTINGS.accentColor,
    theme: overrides.theme ?? TEST_SETTINGS.theme,
    contentProtection: overrides.contentProtection ?? TEST_SETTINGS.contentProtection,
    closeToTray: TEST_SETTINGS.closeToTray,
    checkForUpdates: TEST_SETTINGS.checkForUpdates,
    entryFieldVisibility: overrides.entryFieldVisibility ?? TEST_SETTINGS.entryFieldVisibility,
    entrySort: overrides.entrySort ?? TEST_SETTINGS.entrySort,
    shortcuts: overrides.shortcuts ?? TEST_SETTINGS.shortcuts,
  };
  render(
    <VaultShell
      vault={vault}
      filePath="C:/vaults/personal.kdbx"
      fileInfo={undefined}
      urlOpener={urlOpener}
      clipboardWriter={clipboardWriter}
      mergeSource={mergeSource}
      settings={settings}
      onSettingChange={onSettingChange}
      onLock={onLock}
      onSave={onSave}
      vaultFileActions={vaultFileActions}
      onExportSettings={onExportSettings}
      onImportSettings={onImportSettings}
      onExportAttachment={onExportAttachment}
      onVaultChange={onVaultChange}
    />,
  );
  return {
    onSave,
    onChangeMasterPassword,
    onLock,
    onSettingChange,
    clipboardWriter,
    onExportSettings,
    onImportSettings,
    onVaultChange,
    onExportAttachment,
    mergeSource,
    urlOpener,
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

  describe("Ctrl+F", () => {
    it("focuses the search box and selects what's in it, so typing replaces the old query", async () => {
      const user = userEvent.setup();
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, Entry.create({ title: "GitHub" }));
      vault = vault.addEntry(vault.rootGroup.id, Entry.create({ title: "Mail" }));

      renderShell(vault);
      const search = screen.getByLabelText("Search entries");
      await user.type(search, "old");
      act(() => search.blur());
      expect(search).not.toHaveFocus();

      await user.keyboard("{Control>}f{/Control}");
      expect(search).toHaveFocus();
      await user.keyboard("mail");

      expect(search).toHaveValue("mail");
      expect(screen.getByText("Mail")).toBeInTheDocument();
      expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    });

    it("works with Cmd on macOS too", async () => {
      const user = userEvent.setup();
      renderShell(Vault.create("Mine"));

      await user.keyboard("{Meta>}F{/Meta}");

      expect(screen.getByLabelText("Search entries")).toHaveFocus();
    });

    it("stops the webview's own find-in-page from opening", () => {
      renderShell(Vault.create("Mine"));

      const event = createEvent.keyDown(document, { key: "f", ctrlKey: true });
      fireEvent(document, event);

      expect(event.defaultPrevented).toBe(true);
    });

    it("ignores F on its own and with Shift or Alt held", async () => {
      const user = userEvent.setup();
      renderShell(Vault.create("Mine"));

      await user.keyboard("f");
      await user.keyboard("{Control>}{Shift>}f{/Shift}{/Control}");
      await user.keyboard("{Control>}{Alt>}f{/Alt}{/Control}");

      expect(screen.getByLabelText("Search entries")).not.toHaveFocus();
    });

    it("switches back to the vault from another view", async () => {
      const user = userEvent.setup();
      renderShell(Vault.create("Mine"));
      await user.click(screen.getByRole("button", { name: "Settings" }));

      await user.keyboard("{Control>}f{/Control}");

      expect(screen.getByLabelText("Search entries")).toHaveFocus();
    });

    it("leaves the recycle bin for All Items, which has a search box", async () => {
      const user = userEvent.setup();
      const entry = Entry.create({ title: "Old Site" });
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, entry);
      vault = vault.deleteEntry(entry.id);
      renderShell(vault);
      await user.click(screen.getByText("Recycle Bin"));

      await user.keyboard("{Control>}f{/Control}");

      expect(screen.getByRole("heading", { name: "All Items" })).toBeInTheDocument();
      expect(screen.getByLabelText("Search entries")).toHaveFocus();
    });

    it("does nothing while a merge is in progress, so the merge isn't abandoned", async () => {
      const user = userEvent.setup();
      const mergeSource = fakeMergeSource({
        pickFile: vi.fn().mockResolvedValue("C:/vaults/other.kdbx"),
      });
      renderShell(Vault.create("Mine"), { mergeSource });
      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /merge another vault in/i }));

      const event = createEvent.keyDown(document, { key: "f", ctrlKey: true });
      fireEvent(document, event);

      expect(event.defaultPrevented).toBe(false);
      expect(screen.getByRole("dialog", { name: /merge another vault in/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    });
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

  it.each([
    ["https://github.com", "https://github.com"],
    ["github.com/login", "https://github.com/login"],
  ])("opens the entry's URL %s via the UrlOpener as %s when clicked", async (url, opened) => {
    const user = userEvent.setup();
    const entry = Entry.create({ title: "GitHub", url });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);
    const urlOpener = fakeUrlOpener();

    render(
      <VaultShell
        vault={vault}
        filePath="C:/vaults/personal.kdbx"
        fileInfo={undefined}
        urlOpener={urlOpener}
        onLock={vi.fn()}
        onSave={vi.fn()}
        vaultFileActions={fakeVaultFileActions()}
        settings={TEST_SETTINGS}
        onSettingChange={vi.fn()}
        clipboardWriter={fakeClipboardWriter()}
        mergeSource={fakeMergeSource()}
        onExportSettings={vi.fn().mockResolvedValue(undefined)}
        onImportSettings={vi.fn().mockResolvedValue(undefined)}
        onExportAttachment={vi.fn().mockResolvedValue(undefined)}
        onVaultChange={vi.fn()}
      />,
    );

    await user.click(screen.getByText("GitHub"));
    // Shown the way it's stored; only the address handed to the browser changes.
    await user.click(screen.getByText(url));

    expect(urlOpener.open).toHaveBeenCalledWith(opened);
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
    const writeText = vi.fn().mockResolvedValue(7);
    const clearIfUnchanged = vi.fn().mockResolvedValue(undefined);

    vi.useFakeTimers();
    try {
      renderShell(vault, {
        clipboardWriter: fakeClipboardWriter({ writeText, clearIfUnchanged }),
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
      expect(clearIfUnchanged).toHaveBeenCalledExactlyOnceWith(7);
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

  it("shows and copies what a linked entry's {REF:…} fields point at, but edits the reference", async () => {
    const target = Entry.create({
      title: "Main",
      username: "octocat",
      password: new Password("s3cret!"),
    });
    const ref = target.id.toString().replace(/-/g, "").toUpperCase();
    const linked = Entry.create({
      title: "Linked",
      username: `{REF:U@I:${ref}}`,
      password: new Password(`{REF:P@I:${ref}}`),
    });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, target);
    vault = vault.addEntry(vault.rootGroup.id, linked);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderShell(vault, { clipboardWriter: fakeClipboardWriter({ writeText }) });
    const linkedRow = screen.getByText("Linked").closest("button") as HTMLButtonElement;
    expect(linkedRow).toHaveTextContent("octocat");
    expect(screen.queryByText(/\{REF:/)).not.toBeInTheDocument();

    await user.click(linkedRow);
    await user.click(screen.getByRole("button", { name: "Copy password" }));
    expect(writeText).toHaveBeenCalledWith("s3cret!");

    await user.click(screen.getByRole("button", { name: "Edit entry" }));
    expect(screen.getByLabelText("Username")).toHaveValue(`{REF:U@I:${ref}}`);
  });

  it("does not clear the clipboard from a stale copy once a newer value has been copied", async () => {
    const entry = Entry.create({
      title: "GitHub",
      username: "octocat",
      password: new Password("s3cret!"),
    });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);
    const writeText = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const clearIfUnchanged = vi.fn().mockResolvedValue(undefined);

    vi.useFakeTimers();
    try {
      renderShell(vault, {
        clipboardWriter: fakeClipboardWriter({ writeText, clearIfUnchanged }),
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
      expect(clearIfUnchanged).not.toHaveBeenCalled();
      expect(document.querySelectorAll(".clipboard-clear-bar-fill")).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(clearIfUnchanged).toHaveBeenCalledExactlyOnceWith(2);
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

  describe("expiry", () => {
    it("badges an expired entry in the list and its detail, and says when it expired", async () => {
      const user = userEvent.setup();
      const expiresAt = new Date(Date.now() - 86_400_000);
      let vault = Vault.create("Mine");
      vault = vault
        .addEntry(vault.rootGroup.id, Entry.create({ title: "Old Login", expiresAt }))
        .addEntry(vault.rootGroup.id, Entry.create({ title: "Current Login" }));

      renderShell(vault);

      expect(rowButton("Old Login")).toHaveTextContent("Expired");
      expect(rowButton("Current Login")).not.toHaveTextContent("Expired");

      await user.click(rowButton("Old Login"));

      const header = screen.getByRole("heading", { name: "Old Login" }).parentElement!;
      expect(header).toHaveTextContent("Expired");
      const row = screen.getByText(formatDateTime(expiresAt)).parentElement!;
      expect(row).toHaveTextContent(/^Expired/);
    });

    it("shows when a still-valid entry expires, without a badge", async () => {
      const user = userEvent.setup();
      const expiresAt = new Date(Date.now() + 86_400_000);
      let vault = Vault.create("Mine");
      vault = vault.addEntry(vault.rootGroup.id, Entry.create({ title: "Login", expiresAt }));

      renderShell(vault);
      await user.click(rowButton("Login"));

      expect(screen.getByRole("heading", { name: "Login" }).parentElement!).not.toHaveTextContent(
        "Expired",
      );
      const row = screen.getByText(formatDateTime(expiresAt)).parentElement!;
      expect(row).toHaveTextContent(/^Expires/);
    });
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

    it("reorders top-level groups by dragging one onto another", async () => {
      const work = Group.create("Work");
      const personal = Group.create("Personal");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      vault = vault.addGroup(vault.rootGroup.id, personal);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      const dataTransfer = {
        types: [GROUP_DRAG_TYPE],
        dropEffect: "none",
        effectAllowed: "none",
        setData: () => {},
        getData: (type: string) => (type === GROUP_DRAG_TYPE ? personal.id.toString() : ""),
      };
      const personalRow = rowButton("Personal").closest(".group-row") as HTMLElement;
      const workRow = rowButton("Work").closest(".group-row") as HTMLElement;
      fireEvent.dragStart(personalRow, { dataTransfer });
      // jsdom has no DragEvent, so fireEvent's plain Event fallback drops
      // clientY silently — set it directly on the event, same workaround
      // GroupTree.test.tsx uses for relatedTarget on dragLeave.
      const dropEvent = createEvent.drop(workRow, { dataTransfer });
      Object.defineProperty(dropEvent, "clientY", { value: -1000 });
      fireEvent(workRow, dropEvent);

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.rootGroup.groups.map((g) => g.name)).toEqual(["Personal", "Work"]);
    });

    it("does not save when dropping a group where it already sits", async () => {
      const work = Group.create("Work");
      const personal = Group.create("Personal");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      vault = vault.addGroup(vault.rootGroup.id, personal);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      const dataTransfer = {
        types: [GROUP_DRAG_TYPE],
        dropEffect: "none",
        effectAllowed: "none",
        setData: () => {},
        getData: (type: string) => (type === GROUP_DRAG_TYPE ? work.id.toString() : ""),
      };
      const personalRow = rowButton("Personal").closest(".group-row") as HTMLElement;
      const workRow = rowButton("Work").closest(".group-row") as HTMLElement;
      fireEvent.dragStart(workRow, { dataTransfer });
      const dropEvent = createEvent.drop(personalRow, { dataTransfer });
      Object.defineProperty(dropEvent, "clientY", { value: 1000 });
      fireEvent(personalRow, dropEvent);

      expect(onSave).not.toHaveBeenCalled();
    });

    it("reparents a group by dragging it onto the middle of another group's row", async () => {
      const work = Group.create("Work");
      const personal = Group.create("Personal");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work);
      vault = vault.addGroup(vault.rootGroup.id, personal);
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      const dataTransfer = {
        types: [GROUP_DRAG_TYPE],
        dropEffect: "none",
        effectAllowed: "none",
        setData: () => {},
        getData: (type: string) => (type === GROUP_DRAG_TYPE ? personal.id.toString() : ""),
      };
      const personalRow = rowButton("Personal").closest(".group-row") as HTMLElement;
      const workRow = rowButton("Work").closest(".group-row") as HTMLElement;
      fireEvent.dragStart(personalRow, { dataTransfer });
      const dropEvent = createEvent.drop(workRow, { dataTransfer });
      Object.defineProperty(dropEvent, "clientY", { value: 0 });
      fireEvent(workRow, dropEvent);

      const savedVault: Vault = onSave.mock.calls[0][0];
      expect(savedVault.rootGroup.groups.map((g) => g.name)).toEqual(["Work"]);
      expect(savedVault.findGroup(work.id)?.groups.map((g) => g.name)).toEqual(["Personal"]);
    });

    it("does not save when dropping a group onto the parent it's already directly inside", async () => {
      const work = Group.create("Work");
      const nested = Group.create("Nested");
      let vault = Vault.create("Mine");
      vault = vault.addGroup(vault.rootGroup.id, work.addGroup(nested));
      const onSave = vi.fn().mockResolvedValue(undefined);

      renderShell(vault, { onSave });

      const dataTransfer = {
        types: [GROUP_DRAG_TYPE],
        dropEffect: "none",
        effectAllowed: "none",
        setData: () => {},
        getData: (type: string) => (type === GROUP_DRAG_TYPE ? nested.id.toString() : ""),
      };
      const nestedRow = rowButton("Nested").closest(".group-row") as HTMLElement;
      const workRow = rowButton("Work").closest(".group-row") as HTMLElement;
      fireEvent.dragStart(nestedRow, { dataTransfer });
      const dropEvent = createEvent.drop(workRow, { dataTransfer });
      Object.defineProperty(dropEvent, "clientY", { value: 0 });
      fireEvent(workRow, dropEvent);

      expect(onSave).not.toHaveBeenCalled();
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
          onLock={vi.fn()}
          onSave={vi.fn()}
          vaultFileActions={fakeVaultFileActions()}
          settings={TEST_SETTINGS}
          onSettingChange={vi.fn()}
          clipboardWriter={fakeClipboardWriter()}
          mergeSource={fakeMergeSource()}
          onExportSettings={vi.fn().mockResolvedValue(undefined)}
          onImportSettings={vi.fn().mockResolvedValue(undefined)}
          onExportAttachment={vi.fn().mockResolvedValue(undefined)}
          onVaultChange={vi.fn()}
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
          onLock={vi.fn()}
          onSave={vi.fn()}
          vaultFileActions={fakeVaultFileActions()}
          settings={TEST_SETTINGS}
          onSettingChange={vi.fn()}
          clipboardWriter={fakeClipboardWriter()}
          mergeSource={fakeMergeSource()}
          onExportSettings={vi.fn().mockResolvedValue(undefined)}
          onImportSettings={vi.fn().mockResolvedValue(undefined)}
          onExportAttachment={vi.fn().mockResolvedValue(undefined)}
          onVaultChange={vi.fn()}
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

      const { onSettingChange } = renderShell(vault, {
        generatorPolicy: { length: 16 },
      });

      await user.click(screen.getByRole("button", { name: "Password generator" }));
      await user.click(screen.getByRole("checkbox", { name: /symbols/i }));

      expect(onSettingChange).toHaveBeenCalledWith(
        "generatorPolicy",
        expect.objectContaining({ useSymbols: true }),
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
      await user.click(screen.getByText("Weak").closest("button")!);
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

      const { onSettingChange } = renderShell(vault);

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("checkbox", { name: "Notes" }));

      expect(onSettingChange).toHaveBeenCalledWith(
        "entryFieldVisibility",
        expect.objectContaining({ notes: false }),
      );
    });

    it("reports a content protection change made in the settings screen", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");

      const { onSettingChange } = renderShell(vault, { contentProtection: true });

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("checkbox", { name: /screen sharing/i }));

      expect(onSettingChange).toHaveBeenCalledWith("contentProtection", false);
    });

    it("submits a master password change made in the settings screen", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");

      const { onChangeMasterPassword } = renderShell(vault);

      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /change master password/i }));
      await user.type(screen.getByLabelText("Current password"), "old-pw");
      await user.type(screen.getByLabelText("New password"), "New-password1");
      await user.type(screen.getByLabelText("Confirm new password"), "New-password1");
      await user.click(screen.getByRole("button", { name: /change master password/i }));

      expect(onChangeMasterPassword).toHaveBeenCalledWith("old-pw", "New-password1");
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

      expect(mergeSource.openFile).toHaveBeenCalledWith("C:/vaults/other.kdbx", "pw", undefined);
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

    // The Web Crypto HMAC chain (importKey then sign) resolves over several
    // real event-loop turns, not just one microtask, and how many it needs
    // varies with machine load — a fixed handful flakes once the suite runs
    // wide. Pump turns until `settled` holds instead, capped so a genuine
    // failure still fails rather than hangs. Cases that assert nothing
    // arrives pass no predicate and simply burn the budget.
    const MAX_CRYPTO_TURNS = 100;

    async function flushCrypto(settled: () => boolean = () => false): Promise<void> {
      for (let turn = 0; turn < MAX_CRYPTO_TURNS && !settled(); turn++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
      }
    }

    /** True once a formatted TOTP code ("123 456") is on screen. */
    function codeShown(): boolean {
      return screen.queryByText(/^\d{3} \d{3}$/) !== null;
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
      await flushCrypto(codeShown);

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
      await flushCrypto(codeShown);

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
      await flushCrypto(codeShown);

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
      await flushCrypto(codeShown);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy authenticator code" }));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/));
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });
});

describe("VaultShell entry sorting", () => {
  function entryTitles() {
    return screen
      .getAllByRole("button")
      .filter((button) => button.className.includes("entry-row"))
      .map((button) => button.querySelector(".entry-row-title")?.textContent);
  }

  function vaultWith(entries: readonly Entry[]) {
    let vault = Vault.create("Mine");
    for (const entry of entries) {
      vault = vault.addEntry(vault.rootGroup.id, entry);
    }
    return vault;
  }

  it("lists entries in the vault's own order by default", () => {
    const vault = vaultWith([Entry.create({ title: "Zeta" }), Entry.create({ title: "Alpha" })]);

    renderShell(vault);

    expect(entryTitles()).toEqual(["Zeta", "Alpha"]);
  });

  it("applies the chosen sort order to the list", () => {
    const vault = vaultWith([Entry.create({ title: "Zeta" }), Entry.create({ title: "Alpha" })]);

    renderShell(vault, { entrySort: "title-asc" });

    expect(entryTitles()).toEqual(["Alpha", "Zeta"]);
  });

  it("sorts entries within a single group too, not just All Items", () => {
    const work = Group.create("Work")
      .addEntry(Entry.create({ title: "Zeta" }))
      .addEntry(Entry.create({ title: "Alpha" }));
    let vault = Vault.create("Mine");
    vault = vault.addGroup(vault.rootGroup.id, work);

    renderShell(vault, { entrySort: "title-asc" });
    fireEvent.click(rowButton("Work"));

    expect(entryTitles()).toEqual(["Alpha", "Zeta"]);
  });

  it("sorts search results as well", () => {
    const vault = vaultWith([
      Entry.create({ title: "Zeta mail" }),
      Entry.create({ title: "Alpha mail" }),
    ]);

    renderShell(vault, { entrySort: "title-asc" });
    fireEvent.change(screen.getByLabelText("Search entries"), { target: { value: "mail" } });

    expect(entryTitles()).toEqual(["Alpha mail", "Zeta mail"]);
  });

  it("reports the sort order the user picks from the search bar's sort menu", () => {
    const { onSettingChange } = renderShell(vaultWith([]));

    fireEvent.click(screen.getByRole("button", { name: "Sort entries (Vault order)" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Recently opened" }));

    expect(onSettingChange).toHaveBeenCalledWith("entrySort", "accessed-desc");
  });

  it("names the active order on the sort trigger", () => {
    renderShell(vaultWith([]), { entrySort: "title-asc" });

    expect(screen.getByRole("button", { name: "Sort entries (Title (A–Z))" })).toBeInTheDocument();
  });

  it("records when an entry was opened, in memory, without saving the vault", () => {
    const entry = Entry.create({ title: "Mail" });
    const onVaultChange = vi.fn();
    const { onSave } = renderShell(vaultWith([entry]), { onVaultChange });

    fireEvent.click(screen.getByText("Mail"));

    expect(onSave).not.toHaveBeenCalled();
    const nextVault = onVaultChange.mock.calls[0][0] as Vault;
    expect(nextVault.findEntry(entry.id)?.times.accessedAt).toBeInstanceOf(Date);
  });

  describe("entry history", () => {
    const january = new Date("2026-01-10T09:00:00Z");
    const february = new Date("2026-02-10T09:00:00Z");

    function vaultWithHistory() {
      const oldest = Entry.create({
        title: "GitHub",
        username: "old-user",
        password: new Password("first-pass"),
        url: "https://github.com",
        times: { modifiedAt: january },
      });
      const middle = oldest.update({
        password: new Password("second-pass"),
        notes: "old notes",
        tags: new Tags([new Tag("dev")]),
        customFields: new CustomFields([new CustomField("PIN", "1234", true)]),
        times: { modifiedAt: february },
      });
      const current = middle.update({
        password: new Password("third-pass"),
        url: "https://github.com/login",
        times: { modifiedAt: new Date("2026-03-10T09:00:00Z") },
        history: [oldest, middle],
      });
      const vault = Vault.create("Mine");
      return { vault: vault.addEntry(vault.rootGroup.id, current), current };
    }

    type User = ReturnType<typeof userEvent.setup>;

    async function openRevision(user: User, date: Date) {
      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "History (2)" }));
      await user.click(screen.getByRole("button", { name: new RegExp(formatDateTime(date)) }));
      return screen.getByRole("dialog", {
        name: `Version of GitHub from ${formatDateTime(date)}`,
      });
    }

    it("shows no history section for an entry without revisions", async () => {
      const user = userEvent.setup();
      const vault = Vault.create("Mine");
      renderShell(vault.addEntry(vault.rootGroup.id, Entry.create({ title: "GitHub" })));

      await user.click(screen.getByText("GitHub"));

      expect(screen.queryByRole("button", { name: /History/ })).not.toBeInTheDocument();
    });

    it("lists revisions newest first, each with what the next edit changed", async () => {
      const user = userEvent.setup();
      renderShell(vaultWithHistory().vault);

      await user.click(screen.getByText("GitHub"));
      const toggle = screen.getByRole("button", { name: "History (2)" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Password and URL changed")).not.toBeInTheDocument();

      await user.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const rows = within(screen.getByRole("list")).getAllByRole("button");
      expect(rows.map((row) => row.textContent)).toEqual([
        `${formatDateTime(february)}Password and URL changed`,
        `${formatDateTime(january)}Password, notes, tags and custom fields changed`,
      ]);

      await user.click(toggle);
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("shows a revision read-only, masked until revealed", async () => {
      const user = userEvent.setup();
      renderShell(vaultWithHistory().vault);

      const view = within(await openRevision(user, february));

      expect(view.getByText(`Version from ${formatDateTime(february)}`)).toBeInTheDocument();
      expect(view.getByText("old-user")).toBeInTheDocument();
      expect(view.getByText("https://github.com")).toBeInTheDocument();
      expect(view.getByText("dev")).toBeInTheDocument();
      expect(view.getByText("old notes")).toBeInTheDocument();
      expect(view.queryByText("second-pass")).not.toBeInTheDocument();
      expect(view.queryByText("1234")).not.toBeInTheDocument();

      await user.click(view.getByRole("button", { name: "Show password" }));

      expect(view.getByText("second-pass")).toBeInTheDocument();
      expect(view.getByText("1234")).toBeInTheDocument();
      await user.click(view.getByRole("button", { name: "Hide password" }));
      expect(view.queryByText("second-pass")).not.toBeInTheDocument();
    });

    it("shows dashes for a revision's empty fields and offers no username to copy", async () => {
      const user = userEvent.setup();
      const blank = Entry.create({ times: { modifiedAt: january } });
      const vault = Vault.create("Mine");
      renderShell(
        vault.addEntry(vault.rootGroup.id, blank.update({ title: "GitHub", history: [blank] })),
      );

      await user.click(screen.getByText("GitHub"));
      await user.click(screen.getByRole("button", { name: "History (1)" }));
      await user.click(screen.getByRole("button", { name: /Title changed/ }));

      const dialog = screen.getByRole("dialog", {
        name: `Version of (untitled) from ${formatDateTime(january)}`,
      });
      expect(within(dialog).getAllByText("—")).toHaveLength(4);
      expect(within(dialog).queryByRole("button", { name: "Copy username" })).toBeNull();
    });

    it("copies a revision's username and password", async () => {
      const user = userEvent.setup();
      const clipboardWriter = fakeClipboardWriter();
      renderShell(vaultWithHistory().vault, { clipboardWriter });
      const view = within(await openRevision(user, january));

      await user.click(view.getByRole("button", { name: "Copy password" }));
      expect(clipboardWriter.writeText).toHaveBeenLastCalledWith("first-pass");
      expect(view.getByText("Copied")).toBeInTheDocument();

      await user.click(view.getByRole("button", { name: "Copy username" }));
      expect(clipboardWriter.writeText).toHaveBeenLastCalledWith("old-user");
    });

    it("closes from the close button or the backdrop, but not from a click inside", async () => {
      const user = userEvent.setup();
      renderShell(vaultWithHistory().vault);

      const dialog = await openRevision(user, january);
      await user.click(within(dialog).getByText("old-user"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: new RegExp(formatDateTime(january)) }));
      await user.click(screen.getByRole("dialog").parentElement!);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("restores a revision and closes the dialog", async () => {
      const user = userEvent.setup();
      const { vault, current } = vaultWithHistory();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderShell(vault, { onSave });

      const dialog = await openRevision(user, january);
      await user.click(within(dialog).getByRole("button", { name: "Restore this version" }));

      const restored = (onSave.mock.calls[0][0] as Vault).findEntry(current.id)!;
      expect(restored.password.reveal()).toBe("first-pass");
      expect(restored.username).toBe("old-user");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("deletes a revision once confirmed, and can back out", async () => {
      const user = userEvent.setup();
      const { vault, current } = vaultWithHistory();
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderShell(vault, { onSave });

      const view = within(await openRevision(user, january));
      await user.click(view.getByRole("button", { name: "Delete version" }));
      expect(view.getByText("Delete this version for good?")).toBeInTheDocument();
      await user.click(view.getByRole("button", { name: "Cancel" }));
      expect(view.queryByText("Delete this version for good?")).not.toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();

      await user.click(view.getByRole("button", { name: "Delete version" }));
      await user.click(view.getByRole("button", { name: "Delete" }));

      const saved = (onSave.mock.calls[0][0] as Vault).findEntry(current.id)!;
      expect(saved.history.map((revision) => revision.password.reveal())).toEqual(["second-pass"]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("keeps the dialog open and says why when the save fails", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockRejectedValue(new Error("Disk full"));
      renderShell(vaultWithHistory().vault, { onSave });

      const dialog = await openRevision(user, january);
      await user.click(within(dialog).getByRole("button", { name: "Restore this version" }));
      expect(await within(dialog).findByText("Disk full")).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Delete version" }));
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect(await within(dialog).findByText("Disk full")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("custom icons", () => {
    it("deletes an icon from the vault after warning what uses it", async () => {
      const user = userEvent.setup();
      const logo = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000abcd", new Uint8Array([1]));
      const entry = Entry.create({ title: "Bank", icon: Icon.custom(logo.id) });
      const vault = new Vault(
        "Root",
        Group.create("Root").addEntry(entry),
        undefined,
        [],
        new CustomIcons([logo]),
      );
      const { onSave } = renderShell(vault);

      await user.click(screen.getByText("Bank"));
      await user.click(screen.getByRole("button", { name: "Edit entry" }));
      await user.click(screen.getByRole("button", { name: "Change icon" }));
      await user.click(screen.getByRole("button", { name: "Delete this icon from the vault…" }));
      expect(screen.getByRole("alert")).toHaveTextContent("1 entry or group uses it");
      await user.click(screen.getByRole("button", { name: "Delete icon" }));

      const saved = vi.mocked(onSave).mock.calls[0][0];
      expect(saved.customIcons.size).toBe(0);
      expect(saved.findEntry(entry.id)?.icon).toBe(Icon.AUTO);
    });
  });
});

describe("VaultShell attachments", () => {
  const notes = new Attachment("notes.txt", new Uint8Array([1, 2, 3]));

  function vaultWithAttachment() {
    const entry = Entry.create({ title: "GitHub", attachments: new Attachments([notes]) });
    const vault = Vault.create("Mine");
    return { vault: vault.addEntry(vault.rootGroup.id, entry), entry };
  }

  /** The vault handed to `onSave`, which carries the "entry was opened" stamp too. */
  function savedAttachments(onSave: (vault: Vault) => Promise<void>, entry: Entry) {
    expect(onSave).toHaveBeenCalledTimes(1);
    const [saved] = vi.mocked(onSave).mock.calls[0];
    return saved.findEntry(entry.id)!.attachments;
  }

  it("lists the selected entry's attachments", async () => {
    const user = userEvent.setup();
    renderShell(vaultWithAttachment().vault);

    await user.click(screen.getByText("GitHub"));

    expect(screen.getByText("Attachments (1)")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
  });

  it("attaches a picked file to the entry and saves", async () => {
    const user = userEvent.setup();
    const { vault, entry } = vaultWithAttachment();
    const { onSave } = renderShell(vault);

    await user.click(screen.getByText("GitHub"));
    await user.upload(screen.getByLabelText("Add attachment"), new File(["hi"], "notes.txt"));

    const attachments = savedAttachments(onSave, entry);
    expect(attachments.values.map((attachment) => attachment.name)).toEqual([
      "notes.txt",
      "notes (2).txt",
    ]);
    expect(new TextDecoder().decode(attachments.get("notes (2).txt")?.data)).toBe("hi");
  });

  it("renames an attachment and saves", async () => {
    const user = userEvent.setup();
    const { vault, entry } = vaultWithAttachment();
    const { onSave } = renderShell(vault);

    await user.click(screen.getByText("GitHub"));
    await user.click(screen.getByRole("button", { name: "Rename notes.txt" }));
    await user.clear(screen.getByLabelText("New name for notes.txt"));
    await user.type(screen.getByLabelText("New name for notes.txt"), "todo.txt{Enter}");

    expect(savedAttachments(onSave, entry).get("todo.txt")?.data).toBe(notes.data);
  });

  it("deletes an attachment and saves", async () => {
    const user = userEvent.setup();
    const { vault, entry } = vaultWithAttachment();
    const { onSave } = renderShell(vault);

    await user.click(screen.getByText("GitHub"));
    await user.click(screen.getByRole("button", { name: "Delete notes.txt" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(savedAttachments(onSave, entry).size).toBe(0);
  });

  it("saves a copy of an attachment without touching the vault", async () => {
    const user = userEvent.setup();
    const onExportAttachment = vi.fn().mockResolvedValue("C:/out/notes.txt");
    const { onSave } = renderShell(vaultWithAttachment().vault, { onExportAttachment });

    await user.click(screen.getByText("GitHub"));
    await user.click(screen.getByRole("button", { name: "Save a copy of notes.txt" }));

    expect(onExportAttachment).toHaveBeenCalledWith(notes);
    expect(await screen.findByText(/Saved a copy to C:\/out\/notes.txt/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("drops a half-typed rename when another entry is selected", async () => {
    const user = userEvent.setup();
    const { vault } = vaultWithAttachment();
    const other = Entry.create({ title: "GitLab", attachments: new Attachments([notes]) });
    renderShell(vault.addEntry(vault.rootGroup.id, other));

    await user.click(screen.getByText("GitHub"));
    await user.click(screen.getByRole("button", { name: "Rename notes.txt" }));
    await user.click(screen.getByText("GitLab"));

    expect(screen.queryByLabelText("New name for notes.txt")).not.toBeInTheDocument();
  });

  it("names the attachments a history revision held", async () => {
    const user = userEvent.setup();
    const modifiedAt = new Date("2026-01-15T14:05:00Z");
    const revision = Entry.create({
      title: "GitHub",
      attachments: new Attachments([notes, new Attachment("old.pdf", new Uint8Array([9]))]),
      times: { modifiedAt },
    });
    const vault = Vault.create("Mine");
    renderShell(
      vault.addEntry(
        vault.rootGroup.id,
        revision.update({ attachments: new Attachments([notes]), history: [revision] }),
      ),
    );

    await user.click(screen.getByText("GitHub"));
    await user.click(screen.getByRole("button", { name: "History (1)" }));
    const row = screen.getByRole("button", { name: new RegExp(formatDateTime(modifiedAt)) });
    expect(row).toHaveTextContent("Attachments changed");
    await user.click(row);

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Attachments")).toBeInTheDocument();
    expect(dialog.getByText("notes.txt, old.pdf")).toBeInTheDocument();
  });
});
