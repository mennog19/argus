import { SettingsImportResult } from "../../../src/application/settings-transfer-service";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AccentColor,
  AutoLockSettings,
  AutoTypeSettings,
  DEFAULT_ENTRY_FIELD_VISIBILITY,
  EffectiveSettings,
  EntryFieldVisibility,
  ExpiredEntryAction,
  GroupDeleteMode,
  Theme,
} from "../../../src/application/settings";
import { DEFAULT_SHORTCUTS, ShortcutBindings } from "../../../src/application/shortcuts";
import { VaultFileInfo } from "../../../src/application/vault-access-service";
import { SettingsScreen } from "../../../src/ui/screens/SettingsScreen";
import { VaultFileActions } from "../../../src/ui/screens/settings/DangerZoneSection";
import { fakeFileInfo, fakeVaultFileActions } from "../vault-file-fakes";
import tauriConfig from "../../../src-tauri/tauri.conf.json";

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

function renderSettings(
  overrides: {
    filePath?: string;
    fileInfo?: VaultFileInfo;
    entryCount?: number;
    clipboardClearSeconds?: number;
    autoLock?: AutoLockSettings;
    autoType?: AutoTypeSettings;
    groupDeleteMode?: GroupDeleteMode;
    expiredEntryAction?: ExpiredEntryAction;
    accentColor?: AccentColor;
    theme?: Theme;
    contentProtection?: boolean;
    closeToTray?: boolean;
    checkForUpdates?: boolean;
    entryFieldVisibility?: EntryFieldVisibility;
    shortcuts?: ShortcutBindings;
    vaultName?: string;
    vaultFileActions?: Partial<VaultFileActions>;
    onOpenMergeWizard?: () => void;
    mergeError?: string;
    onExportSettings?: () => Promise<string | undefined>;
    onImportSettings?: () => Promise<SettingsImportResult | undefined>;
  } = {},
) {
  const vaultFileActions = fakeVaultFileActions(overrides.vaultFileActions);
  const onOpenMergeWizard = overrides.onOpenMergeWizard ?? vi.fn();
  const onSettingChange = vi.fn();
  const onExportSettings = overrides.onExportSettings ?? vi.fn().mockResolvedValue(undefined);
  const onImportSettings = overrides.onImportSettings ?? vi.fn().mockResolvedValue(undefined);
  // Flat overrides are this helper's own convenience; the screen itself takes
  // one resolved settings object.
  const settings: EffectiveSettings = {
    generatorPolicy: {},
    clipboardClearSeconds: overrides.clipboardClearSeconds ?? 20,
    autoLock: overrides.autoLock ?? DEFAULT_AUTO_LOCK,
    autoType: overrides.autoType ?? DEFAULT_AUTO_TYPE,
    groupDeleteMode: overrides.groupDeleteMode ?? "deleteContents",
    expiredEntryAction: overrides.expiredEntryAction ?? "mark",
    accentColor: overrides.accentColor ?? DEFAULT_ACCENT_COLOR,
    theme: overrides.theme ?? "dark",
    contentProtection: overrides.contentProtection ?? true,
    closeToTray: overrides.closeToTray ?? false,
    checkForUpdates: overrides.checkForUpdates ?? false,
    entryFieldVisibility: overrides.entryFieldVisibility ?? DEFAULT_ENTRY_FIELD_VISIBILITY,
    entrySort: "manual",
    shortcuts: overrides.shortcuts ?? DEFAULT_SHORTCUTS,
  };
  const { container, unmount } = render(
    <SettingsScreen
      filePath={overrides.filePath ?? "C:/vaults/personal.kdbx"}
      fileInfo={overrides.fileInfo}
      entryCount={overrides.entryCount ?? 0}
      settings={settings}
      onSettingChange={onSettingChange}
      vaultName={overrides.vaultName ?? "Personal"}
      vaultFileActions={vaultFileActions}
      mergeError={overrides.mergeError}
      onOpenMergeWizard={onOpenMergeWizard}
      onExportSettings={onExportSettings}
      onImportSettings={onImportSettings}
    />,
  );
  return {
    container,
    unmount,
    ...vaultFileActions,
    onOpenMergeWizard,
    onSettingChange,
    onExportSettings,
    onImportSettings,
  };
}

describe("SettingsScreen", () => {
  describe("searching", () => {
    function sectionLabels(container: HTMLElement) {
      return Array.from(container.querySelectorAll(".detail-section-label")).map(
        (label) => label.textContent,
      );
    }

    it("shows every section until something is typed", () => {
      const { container } = renderSettings();

      expect(sectionLabels(container)).toEqual([
        "Vault",
        "Appearance",
        "Window",
        "Updates",
        "Security",
        "Auto-type",
        "Keyboard shortcuts",
        "Groups",
        "Entry creation",
        "Expired entries",
        "Settings file",
        "Danger zone",
      ]);
    });

    it("narrows to the sections that mention every word typed, in any order or case", async () => {
      const user = userEvent.setup();
      const { container } = renderSettings();

      await user.type(
        screen.getByRole("textbox", { name: "Search settings" }),
        " Clipboard CLEAR ",
      );

      expect(sectionLabels(container)).toEqual(["Security"]);
    });

    it("finds a section by the wording of a setting in it", async () => {
      const user = userEvent.setup();
      const { container } = renderSettings();

      await user.type(screen.getByRole("textbox", { name: "Search settings" }), "tray");

      expect(sectionLabels(container)).toEqual(["Window"]);
    });

    it("says so when nothing matches, and Escape brings everything back", async () => {
      const user = userEvent.setup();
      const { container } = renderSettings();
      const search = screen.getByRole("textbox", { name: "Search settings" });

      await user.type(search, "zzz");
      expect(screen.getByText('No settings match "zzz".')).toBeInTheDocument();
      expect(sectionLabels(container)).toEqual([]);

      await user.keyboard("{Escape}");
      expect(search).toHaveValue("");
      expect(sectionLabels(container)).toHaveLength(12);
    });
  });

  it("shows the vault file name and placeholders while file info hasn't loaded yet", () => {
    renderSettings();

    expect(screen.getByText("personal.kdbx")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("shows the number of stored passwords", () => {
    renderSettings({ entryCount: 7 });

    expect(screen.getByText("Passwords")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows the vault's size, format and last-saved time once file info loads", () => {
    const fileInfo = fakeFileInfo({ sizeBytes: 49152, format: { major: 4, minor: 1 } });
    renderSettings({ fileInfo });

    expect(screen.getByText("48 KB")).toBeInTheDocument();
    expect(screen.getByText("KDBX 4.1")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("shows the current group delete mode", () => {
    renderSettings({ groupDeleteMode: "keepContents" });

    expect(screen.getByRole("radio", { name: /keep its entries/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /delete its entries/i })).not.toBeChecked();
  });

  it("reports a group delete mode change in either direction", () => {
    const { onSettingChange } = renderSettings();

    fireEvent.click(screen.getByRole("radio", { name: /keep its entries/i }));
    expect(onSettingChange).toHaveBeenLastCalledWith("groupDeleteMode", "keepContents");

    cleanup();
    const second = renderSettings({ groupDeleteMode: "keepContents" });
    fireEvent.click(screen.getByRole("radio", { name: /delete its entries/i }));
    expect(second.onSettingChange).toHaveBeenLastCalledWith("groupDeleteMode", "deleteContents");
  });

  it("shows the current expired entry action", () => {
    renderSettings({ expiredEntryAction: "recycle" });

    expect(screen.getByRole("radio", { name: /move it to the recycle bin/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /mark it as expired/i })).not.toBeChecked();
  });

  it.each([
    [/mark it as expired/i, "mark", "delete"],
    [/move it to the recycle bin/i, "recycle", "mark"],
    [/delete it permanently/i, "delete", "mark"],
  ] as const)("reports picking %s", (name, action, current) => {
    const { onSettingChange } = renderSettings({ expiredEntryAction: current });

    fireEvent.click(screen.getByRole("radio", { name }));

    expect(onSettingChange).toHaveBeenLastCalledWith("expiredEntryAction", action);
  });

  it("warns that permanently deleting expired entries can't be undone", () => {
    renderSettings({ expiredEntryAction: "mark" });
    expect(screen.queryByText(/can't be undone/i)).not.toBeInTheDocument();

    cleanup();
    renderSettings({ expiredEntryAction: "delete" });
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
  });

  it("shows the current clipboard clear delay", () => {
    renderSettings({ clipboardClearSeconds: 30 });

    expect(screen.getByLabelText(/clear clipboard after/i)).toHaveValue(30);
  });

  it("reports a valid new clipboard clear delay", () => {
    const { onSettingChange } = renderSettings();

    fireEvent.change(screen.getByLabelText(/clear clipboard after/i), { target: { value: "45" } });

    expect(onSettingChange).toHaveBeenCalledWith("clipboardClearSeconds", 45);
  });

  it("ignores a non-integer or non-positive value instead of reporting it", () => {
    const { onSettingChange } = renderSettings();

    fireEvent.change(screen.getByLabelText(/clear clipboard after/i), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/clear clipboard after/i), { target: { value: "abc" } });

    expect(onSettingChange).not.toHaveBeenCalled();
  });

  it("steps the clipboard clear delay up and down via the stepper buttons", () => {
    const { onSettingChange } = renderSettings({ clipboardClearSeconds: 20 });

    fireEvent.click(screen.getByRole("button", { name: /increase clipboard clear seconds/i }));
    expect(onSettingChange).toHaveBeenLastCalledWith("clipboardClearSeconds", 21);

    fireEvent.click(screen.getByRole("button", { name: /decrease clipboard clear seconds/i }));
    expect(onSettingChange).toHaveBeenLastCalledWith("clipboardClearSeconds", 19);
  });

  it("floors the clipboard clear delay stepper at 1 second", () => {
    const { onSettingChange } = renderSettings({ clipboardClearSeconds: 1 });

    fireEvent.click(screen.getByRole("button", { name: /decrease clipboard clear seconds/i }));

    expect(onSettingChange).toHaveBeenLastCalledWith("clipboardClearSeconds", 1);
  });

  it("caps the clipboard clear delay at 10 minutes, typed or stepped", () => {
    const { onSettingChange } = renderSettings({ clipboardClearSeconds: 600 });
    const input = screen.getByLabelText(/clear clipboard after/i);
    expect(input).toHaveAttribute("max", "600");

    fireEvent.change(input, { target: { value: "86400" } });
    expect(onSettingChange).toHaveBeenLastCalledWith("clipboardClearSeconds", 600);

    fireEvent.click(screen.getByRole("button", { name: /increase clipboard clear seconds/i }));
    expect(onSettingChange).toHaveBeenLastCalledWith("clipboardClearSeconds", 600);
  });

  it("caps the idle timeout at 24 hours, typed or stepped", () => {
    const { onSettingChange } = renderSettings({
      autoLock: {
        idleTimeoutMinutes: 1440,
        lockOnMinimize: false,
        lockOnSleep: false,
        lockOnSessionLock: false,
      },
    });
    const input = screen.getByLabelText(/lock after inactivity/i);
    expect(input).toHaveAttribute("max", "1440");

    fireEvent.change(input, { target: { value: "100000" } });
    expect(onSettingChange).toHaveBeenLastCalledWith(
      "autoLock",
      expect.objectContaining({ idleTimeoutMinutes: 1440 }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /increase lock-after-inactivity minutes/i }),
    );
    expect(onSettingChange).toHaveBeenLastCalledWith(
      "autoLock",
      expect.objectContaining({ idleTimeoutMinutes: 1440 }),
    );
  });

  it("shows a blank idle timeout and unchecked toggles by default", () => {
    renderSettings();

    expect(screen.getByLabelText(/lock after inactivity/i)).toHaveValue(null);
    expect(screen.getByRole("checkbox", { name: /minimized/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /system sleeps/i })).not.toBeChecked();
  });

  it("shows an already-configured idle timeout and toggles", () => {
    renderSettings({
      autoLock: {
        idleTimeoutMinutes: 15,
        lockOnMinimize: true,
        lockOnSleep: true,
        lockOnSessionLock: false,
      },
    });

    expect(screen.getByLabelText(/lock after inactivity/i)).toHaveValue(15);
    expect(screen.getByRole("checkbox", { name: /minimized/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /system sleeps/i })).toBeChecked();
  });

  it("reports a valid new idle timeout", () => {
    const { onSettingChange } = renderSettings();

    fireEvent.change(screen.getByLabelText(/lock after inactivity/i), { target: { value: "10" } });

    expect(onSettingChange).toHaveBeenCalledWith(
      "autoLock",
      expect.objectContaining({ idleTimeoutMinutes: 10 }),
    );
  });

  it("clears the idle timeout when the field is emptied", () => {
    const { onSettingChange } = renderSettings({
      autoLock: {
        idleTimeoutMinutes: 10,
        lockOnMinimize: false,
        lockOnSleep: false,
        lockOnSessionLock: false,
      },
    });

    fireEvent.change(screen.getByLabelText(/lock after inactivity/i), { target: { value: "" } });

    expect(onSettingChange).toHaveBeenCalledWith(
      "autoLock",
      expect.objectContaining({ idleTimeoutMinutes: undefined }),
    );
  });

  it("ignores a non-integer or non-positive idle timeout instead of reporting it", () => {
    const { onSettingChange } = renderSettings();

    fireEvent.change(screen.getByLabelText(/lock after inactivity/i), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/lock after inactivity/i), { target: { value: "abc" } });

    expect(onSettingChange).not.toHaveBeenCalled();
  });

  it("steps a blank idle timeout up to 1 minute via the stepper button", () => {
    const { onSettingChange } = renderSettings();

    fireEvent.click(
      screen.getByRole("button", { name: /increase lock-after-inactivity minutes/i }),
    );

    expect(onSettingChange).toHaveBeenCalledWith(
      "autoLock",
      expect.objectContaining({ idleTimeoutMinutes: 1 }),
    );
  });

  it("steps an already-configured idle timeout up and down", () => {
    const { onSettingChange } = renderSettings({
      autoLock: {
        idleTimeoutMinutes: 10,
        lockOnMinimize: false,
        lockOnSleep: false,
        lockOnSessionLock: false,
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /increase lock-after-inactivity minutes/i }),
    );
    expect(onSettingChange).toHaveBeenLastCalledWith(
      "autoLock",
      expect.objectContaining({ idleTimeoutMinutes: 11 }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /decrease lock-after-inactivity minutes/i }),
    );
    expect(onSettingChange).toHaveBeenLastCalledWith(
      "autoLock",
      expect.objectContaining({ idleTimeoutMinutes: 9 }),
    );
  });

  it("clears the idle timeout when stepping down from 1 minute", () => {
    const { onSettingChange } = renderSettings({
      autoLock: {
        idleTimeoutMinutes: 1,
        lockOnMinimize: false,
        lockOnSleep: false,
        lockOnSessionLock: false,
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /decrease lock-after-inactivity minutes/i }),
    );

    expect(onSettingChange).toHaveBeenCalledWith(
      "autoLock",
      expect.objectContaining({ idleTimeoutMinutes: undefined }),
    );
  });

  it("ignores a decrease of an already-blank idle timeout", () => {
    const { onSettingChange } = renderSettings();

    fireEvent.click(
      screen.getByRole("button", { name: /decrease lock-after-inactivity minutes/i }),
    );

    expect(onSettingChange).not.toHaveBeenCalled();
  });

  it("toggles lock-on-session-lock on its own", () => {
    const { onSettingChange } = renderSettings();

    fireEvent.click(screen.getByRole("checkbox", { name: /computer is locked/i }));

    expect(onSettingChange).toHaveBeenLastCalledWith(
      "autoLock",
      expect.objectContaining({
        lockOnMinimize: false,
        lockOnSleep: false,
        lockOnSessionLock: true,
      }),
    );
  });

  it("toggles lock-on-minimize and lock-on-sleep independently", () => {
    const { onSettingChange } = renderSettings();

    fireEvent.click(screen.getByRole("checkbox", { name: /minimized/i }));
    expect(onSettingChange).toHaveBeenLastCalledWith(
      "autoLock",
      expect.objectContaining({
        lockOnMinimize: true,
        lockOnSleep: false,
        lockOnSessionLock: false,
      }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /system sleeps/i }));
    expect(onSettingChange).toHaveBeenLastCalledWith(
      "autoLock",
      expect.objectContaining({
        lockOnMinimize: false,
        lockOnSleep: true,
        lockOnSessionLock: false,
      }),
    );
  });

  it("shows the current content protection setting", () => {
    renderSettings({ contentProtection: false });

    expect(screen.getByRole("checkbox", { name: /screen sharing/i })).not.toBeChecked();
  });

  it("reports a content protection toggle", () => {
    const { onSettingChange } = renderSettings({ contentProtection: true });

    fireEvent.click(screen.getByRole("checkbox", { name: /screen sharing/i }));

    expect(onSettingChange).toHaveBeenCalledWith("contentProtection", false);
  });

  it("shows minimize-to-tray off by default", () => {
    renderSettings();

    expect(screen.getByRole("checkbox", { name: /system tray/i })).not.toBeChecked();
  });

  it("reports turning minimize-to-tray on and off", () => {
    const { onSettingChange, unmount } = renderSettings({ closeToTray: false });

    fireEvent.click(screen.getByRole("checkbox", { name: /system tray/i }));
    expect(onSettingChange).toHaveBeenCalledWith("closeToTray", true);
    unmount();

    const { onSettingChange: onSecondChange } = renderSettings({ closeToTray: true });
    fireEvent.click(screen.getByRole("checkbox", { name: /system tray/i }));
    expect(onSecondChange).toHaveBeenCalledWith("closeToTray", false);
  });

  it("shows the version of Argus that is running", () => {
    renderSettings();

    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText(tauriConfig.version)).toBeInTheDocument();
  });

  it("shows the launch update check off by default", () => {
    renderSettings();

    expect(screen.getByRole("checkbox", { name: /check for updates/i })).not.toBeChecked();
  });

  it("reports turning the launch update check on and off", () => {
    const { onSettingChange, unmount } = renderSettings({ checkForUpdates: false });

    fireEvent.click(screen.getByRole("checkbox", { name: /check for updates/i }));
    expect(onSettingChange).toHaveBeenCalledWith("checkForUpdates", true);
    unmount();

    const { onSettingChange: onSecondChange } = renderSettings({ checkForUpdates: true });
    expect(screen.getByRole("checkbox", { name: /check for updates/i })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /check for updates/i }));
    expect(onSecondChange).toHaveBeenCalledWith("checkForUpdates", false);
  });

  describe("danger zone", () => {
    it("reports a request to open the merge wizard", () => {
      const { onOpenMergeWizard } = renderSettings();

      fireEvent.click(screen.getByRole("button", { name: /merge another vault in/i }));

      expect(onOpenMergeWizard).toHaveBeenCalled();
    });

    it("shows why a merge could not be started, and nothing when there's no reason", () => {
      const { unmount } = renderSettings({ mergeError: "That's the vault you already have open." });

      expect(screen.getByText("That's the vault you already have open.")).toBeInTheDocument();

      unmount();
      renderSettings();

      expect(screen.queryByText("That's the vault you already have open.")).not.toBeInTheDocument();
    });

    it("groups merging and changing the master password under one danger zone", () => {
      const { container } = renderSettings();

      const dangerZone = container.querySelector(".danger-zone");
      expect(dangerZone).not.toBeNull();
      expect(dangerZone).toHaveTextContent("Danger zone");
      expect(dangerZone).toHaveTextContent(/merge another vault in/i);
      expect(dangerZone).toHaveTextContent(/change master password/i);
    });
  });

  describe("file format", () => {
    it("offers a KDBX 3 vault an upgrade, and passes it to onUpgradeFormat", async () => {
      const user = userEvent.setup();
      const { onUpgradeFormat } = renderSettings({
        fileInfo: fakeFileInfo({ format: { major: 3, minor: 1 } }),
      });

      await user.click(screen.getByRole("button", { name: "Upgrade to KDBX 4" }));
      await user.click(screen.getByRole("button", { name: "Upgrade to KDBX 4" }));

      expect(onUpgradeFormat).toHaveBeenCalledOnce();
    });

    it("offers no upgrade to a vault that is already KDBX 4", () => {
      renderSettings({
        fileInfo: fakeFileInfo({ format: { major: 4, minor: 0 } }),
      });

      expect(screen.queryByRole("button", { name: /upgrade/i })).not.toBeInTheDocument();
    });
  });

  describe("master password", () => {
    it("only shows the form after the change master password button is pressed", () => {
      renderSettings();

      expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /change master password/i })).toBeInTheDocument();
    });

    it("submits a change through the onChangeMasterPassword callback", async () => {
      const user = userEvent.setup();
      const { onChangeMasterPassword } = renderSettings();

      await user.click(screen.getByRole("button", { name: /change master password/i }));
      await user.type(screen.getByLabelText("Current password"), "old-pw");
      await user.type(screen.getByLabelText("New password"), "New-password1");
      await user.type(screen.getByLabelText("Confirm new password"), "New-password1");
      await user.click(screen.getByRole("button", { name: /change master password/i }));

      expect(onChangeMasterPassword).toHaveBeenCalledWith("old-pw", "New-password1");
    });
  });

  describe("accent color", () => {
    it("marks the current preset as checked and the others as unchecked", () => {
      renderSettings({ accentColor: { kind: "preset", id: "teal" } });

      expect(screen.getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: "Blue" })).toHaveAttribute("aria-checked", "false");
      expect(screen.getByRole("radio", { name: "Custom" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    });

    it("reports a preset selection", () => {
      const { onSettingChange } = renderSettings();

      fireEvent.click(screen.getByRole("radio", { name: "Purple" }));

      expect(onSettingChange).toHaveBeenCalledWith("accentColor", { kind: "preset", id: "purple" });
    });

    it("does not show the hue slider while a preset is selected", () => {
      renderSettings();

      expect(screen.queryByLabelText(/custom color/i)).not.toBeInTheDocument();
    });

    it("switches to custom, seeded from the current preset's hue, when Custom is chosen", () => {
      const { onSettingChange } = renderSettings({
        accentColor: { kind: "preset", id: "teal" },
      });

      fireEvent.click(screen.getByRole("radio", { name: "Custom" }));

      expect(onSettingChange).toHaveBeenCalledWith("accentColor", { kind: "custom", hue: 195 });
    });

    it("shows the hue slider at the current hue once custom is active", () => {
      renderSettings({ accentColor: { kind: "custom", hue: 88 } });

      expect(screen.getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByLabelText(/custom color/i)).toHaveValue("88");
    });

    it("reports a new hue as the slider moves", () => {
      const { onSettingChange } = renderSettings({ accentColor: { kind: "custom", hue: 88 } });

      fireEvent.change(screen.getByLabelText(/custom color/i), { target: { value: "210" } });

      expect(onSettingChange).toHaveBeenCalledWith("accentColor", { kind: "custom", hue: 210 });
    });
  });

  describe("theme", () => {
    it("marks the current theme as checked and the other as unchecked", () => {
      renderSettings({ theme: "light" });

      expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
    });

    it("reports a theme selection", () => {
      const { onSettingChange } = renderSettings({ theme: "dark" });

      fireEvent.click(screen.getByRole("radio", { name: "Light" }));

      expect(onSettingChange).toHaveBeenCalledWith("theme", "light");
    });

    it("reports switching back to dark", () => {
      const { onSettingChange } = renderSettings({ theme: "light" });

      fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

      expect(onSettingChange).toHaveBeenCalledWith("theme", "dark");
    });
  });

  describe("entry creation field visibility", () => {
    it("shows every toggleable field as checked by default", () => {
      renderSettings();

      expect(screen.getByRole("checkbox", { name: "Username" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Password" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Authenticator (TOTP)" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "URL" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Notes" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Group" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Tags" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Expiry date" })).toBeChecked();
    });

    it("reports hiding the expiry date field", () => {
      const { onSettingChange } = renderSettings();

      fireEvent.click(screen.getByRole("checkbox", { name: "Expiry date" }));

      expect(onSettingChange).toHaveBeenCalledWith("entryFieldVisibility", {
        ...DEFAULT_ENTRY_FIELD_VISIBILITY,
        expiry: false,
      });
    });

    it("reflects a field that's been turned off", () => {
      renderSettings({
        entryFieldVisibility: { ...DEFAULT_ENTRY_FIELD_VISIBILITY, password: false },
      });

      expect(screen.getByRole("checkbox", { name: "Password" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Username" })).toBeChecked();
    });

    it("reports turning a field off and on again", () => {
      const { onSettingChange } = renderSettings();

      fireEvent.click(screen.getByRole("checkbox", { name: "Notes" }));

      expect(onSettingChange).toHaveBeenCalledWith(
        "entryFieldVisibility",
        expect.objectContaining({ notes: false }),
      );

      cleanup();
      const second = renderSettings({
        entryFieldVisibility: { ...DEFAULT_ENTRY_FIELD_VISIBILITY, notes: false },
      });
      fireEvent.click(screen.getByRole("checkbox", { name: "Notes" }));

      expect(second.onSettingChange).toHaveBeenCalledWith(
        "entryFieldVisibility",
        expect.objectContaining({ notes: true }),
      );
    });
  });
  describe("settings file", () => {
    it("exports the settings through the injected handler", () => {
      const { onExportSettings } = renderSettings();

      fireEvent.click(screen.getByRole("button", { name: /export settings/i }));

      expect(onExportSettings).toHaveBeenCalled();
    });

    it("imports the settings through the injected handler", () => {
      const { onImportSettings } = renderSettings();

      fireEvent.click(screen.getByRole("button", { name: /import settings/i }));

      expect(onImportSettings).toHaveBeenCalled();
    });
  });

  describe("auto-type", () => {
    it("is off by default, with the default hotkey shown", () => {
      renderSettings();

      expect(screen.getByRole("checkbox", { name: /hotkey/i })).not.toBeChecked();
      expect(screen.getByLabelText("Hotkey")).toHaveTextContent("Ctrl + Shift + A");
    });

    it("reports being switched on", async () => {
      const { onSettingChange } = renderSettings();

      await userEvent.click(screen.getByRole("checkbox", { name: /hotkey/i }));

      expect(onSettingChange).toHaveBeenCalledWith("autoType", {
        ...DEFAULT_AUTO_TYPE,
        enabled: true,
      });
    });

    it("reports being switched off again", async () => {
      const { onSettingChange } = renderSettings({
        autoType: { ...DEFAULT_AUTO_TYPE, enabled: true },
      });

      await userEvent.click(screen.getByRole("checkbox", { name: /hotkey/i }));

      expect(onSettingChange).toHaveBeenCalledWith("autoType", {
        ...DEFAULT_AUTO_TYPE,
        enabled: false,
      });
    });

    it("reports a newly recorded hotkey", async () => {
      const { onSettingChange } = renderSettings();
      const hotkey = screen.getByLabelText("Hotkey");

      await userEvent.click(hotkey);
      fireEvent.keyDown(hotkey, { code: "Space", altKey: true });
      fireEvent.keyDown(hotkey, { code: "Enter" });

      expect(onSettingChange).toHaveBeenCalledWith("autoType", {
        ...DEFAULT_AUTO_TYPE,
        hotkey: "Alt+Space",
      });
    });
  });
});
