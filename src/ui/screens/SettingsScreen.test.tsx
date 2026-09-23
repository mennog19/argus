import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AccentColor,
  AutoLockSettings,
  DEFAULT_ENTRY_FIELD_VISIBILITY,
  EntryFieldVisibility,
  GroupDeleteMode,
  Theme,
} from "../../application/settings";
import { VaultFileInfo } from "../../application/vault-access-service";
import { SettingsScreen } from "./SettingsScreen";

const DEFAULT_AUTO_LOCK: AutoLockSettings = { lockOnMinimize: false, lockOnSleep: false };
const DEFAULT_ACCENT_COLOR: AccentColor = { kind: "preset", id: "blue" };

function renderSettings(
  overrides: {
    filePath?: string;
    fileInfo?: VaultFileInfo;
    entryCount?: number;
    clipboardClearSeconds?: number;
    autoLock?: AutoLockSettings;
    groupDeleteMode?: GroupDeleteMode;
    accentColor?: AccentColor;
    theme?: Theme;
    contentProtection?: boolean;
    entryFieldVisibility?: EntryFieldVisibility;
    onChangeMasterPassword?: (currentPassword: string, newPassword: string) => Promise<void>;
    onOpenMergeWizard?: () => void;
    mergeError?: string;
    onExportSettings?: () => Promise<string | undefined>;
    onImportSettings?: () => Promise<string | undefined>;
  } = {},
) {
  const onChangeMasterPassword =
    overrides.onChangeMasterPassword ?? vi.fn().mockResolvedValue(undefined);
  const onOpenMergeWizard = overrides.onOpenMergeWizard ?? vi.fn();
  const onClipboardClearSecondsChange = vi.fn();
  const onAutoLockChange = vi.fn();
  const onGroupDeleteModeChange = vi.fn();
  const onAccentColorChange = vi.fn();
  const onThemeChange = vi.fn();
  const onContentProtectionChange = vi.fn();
  const onEntryFieldVisibilityChange = vi.fn();
  const onExportSettings = overrides.onExportSettings ?? vi.fn().mockResolvedValue(undefined);
  const onImportSettings = overrides.onImportSettings ?? vi.fn().mockResolvedValue(undefined);
  const { container, unmount } = render(
    <SettingsScreen
      filePath={overrides.filePath ?? "C:/vaults/personal.kdbx"}
      fileInfo={overrides.fileInfo}
      entryCount={overrides.entryCount ?? 0}
      clipboardClearSeconds={overrides.clipboardClearSeconds ?? 20}
      autoLock={overrides.autoLock ?? DEFAULT_AUTO_LOCK}
      groupDeleteMode={overrides.groupDeleteMode ?? "deleteContents"}
      accentColor={overrides.accentColor ?? DEFAULT_ACCENT_COLOR}
      theme={overrides.theme ?? "dark"}
      contentProtection={overrides.contentProtection ?? true}
      entryFieldVisibility={overrides.entryFieldVisibility ?? DEFAULT_ENTRY_FIELD_VISIBILITY}
      onChangeMasterPassword={onChangeMasterPassword}
      mergeError={overrides.mergeError}
      onOpenMergeWizard={onOpenMergeWizard}
      onClipboardClearSecondsChange={onClipboardClearSecondsChange}
      onAutoLockChange={onAutoLockChange}
      onGroupDeleteModeChange={onGroupDeleteModeChange}
      onAccentColorChange={onAccentColorChange}
      onThemeChange={onThemeChange}
      onContentProtectionChange={onContentProtectionChange}
      onEntryFieldVisibilityChange={onEntryFieldVisibilityChange}
      onExportSettings={onExportSettings}
      onImportSettings={onImportSettings}
    />,
  );
  return {
    container,
    unmount,
    onChangeMasterPassword,
    onOpenMergeWizard,
    onClipboardClearSecondsChange,
    onAutoLockChange,
    onGroupDeleteModeChange,
    onAccentColorChange,
    onThemeChange,
    onContentProtectionChange,
    onEntryFieldVisibilityChange,
    onExportSettings,
    onImportSettings,
  };
}

describe("SettingsScreen", () => {
  it("shows the vault file name and placeholders while file info hasn't loaded yet", () => {
    renderSettings();

    expect(screen.getByText("personal.kdbx")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows the number of stored passwords", () => {
    renderSettings({ entryCount: 7 });

    expect(screen.getByText("Passwords")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows the vault's size and last-saved time once file info loads", () => {
    const fileInfo: VaultFileInfo = { sizeBytes: 49152, lastModifiedMs: Date.now() };
    renderSettings({ fileInfo });

    expect(screen.getByText("48 KB")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("shows the current group delete mode", () => {
    renderSettings({ groupDeleteMode: "keepContents" });

    expect(screen.getByRole("radio", { name: /keep its entries/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /delete its entries/i })).not.toBeChecked();
  });

  it("reports a group delete mode change in either direction", () => {
    const { onGroupDeleteModeChange } = renderSettings();

    fireEvent.click(screen.getByRole("radio", { name: /keep its entries/i }));
    expect(onGroupDeleteModeChange).toHaveBeenLastCalledWith("keepContents");

    cleanup();
    const second = renderSettings({ groupDeleteMode: "keepContents" });
    fireEvent.click(screen.getByRole("radio", { name: /delete its entries/i }));
    expect(second.onGroupDeleteModeChange).toHaveBeenLastCalledWith("deleteContents");
  });

  it("shows the current clipboard clear delay", () => {
    renderSettings({ clipboardClearSeconds: 30 });

    expect(screen.getByLabelText(/clear clipboard after/i)).toHaveValue(30);
  });

  it("reports a valid new clipboard clear delay", () => {
    const { onClipboardClearSecondsChange } = renderSettings();

    fireEvent.change(screen.getByLabelText(/clear clipboard after/i), { target: { value: "45" } });

    expect(onClipboardClearSecondsChange).toHaveBeenCalledWith(45);
  });

  it("ignores a non-integer or non-positive value instead of reporting it", () => {
    const { onClipboardClearSecondsChange } = renderSettings();

    fireEvent.change(screen.getByLabelText(/clear clipboard after/i), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/clear clipboard after/i), { target: { value: "abc" } });

    expect(onClipboardClearSecondsChange).not.toHaveBeenCalled();
  });

  it("steps the clipboard clear delay up and down via the stepper buttons", () => {
    const { onClipboardClearSecondsChange } = renderSettings({ clipboardClearSeconds: 20 });

    fireEvent.click(screen.getByRole("button", { name: /increase clipboard clear seconds/i }));
    expect(onClipboardClearSecondsChange).toHaveBeenLastCalledWith(21);

    fireEvent.click(screen.getByRole("button", { name: /decrease clipboard clear seconds/i }));
    expect(onClipboardClearSecondsChange).toHaveBeenLastCalledWith(19);
  });

  it("floors the clipboard clear delay stepper at 1 second", () => {
    const { onClipboardClearSecondsChange } = renderSettings({ clipboardClearSeconds: 1 });

    fireEvent.click(screen.getByRole("button", { name: /decrease clipboard clear seconds/i }));

    expect(onClipboardClearSecondsChange).toHaveBeenLastCalledWith(1);
  });

  it("shows a blank idle timeout and unchecked toggles by default", () => {
    renderSettings();

    expect(screen.getByLabelText(/lock after inactivity/i)).toHaveValue(null);
    expect(screen.getByRole("checkbox", { name: /minimized/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /system sleeps/i })).not.toBeChecked();
  });

  it("shows an already-configured idle timeout and toggles", () => {
    renderSettings({
      autoLock: { idleTimeoutMinutes: 15, lockOnMinimize: true, lockOnSleep: true },
    });

    expect(screen.getByLabelText(/lock after inactivity/i)).toHaveValue(15);
    expect(screen.getByRole("checkbox", { name: /minimized/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /system sleeps/i })).toBeChecked();
  });

  it("reports a valid new idle timeout", () => {
    const { onAutoLockChange } = renderSettings();

    fireEvent.change(screen.getByLabelText(/lock after inactivity/i), { target: { value: "10" } });

    expect(onAutoLockChange).toHaveBeenCalledWith(
      expect.objectContaining({ idleTimeoutMinutes: 10 }),
    );
  });

  it("clears the idle timeout when the field is emptied", () => {
    const { onAutoLockChange } = renderSettings({
      autoLock: { idleTimeoutMinutes: 10, lockOnMinimize: false, lockOnSleep: false },
    });

    fireEvent.change(screen.getByLabelText(/lock after inactivity/i), { target: { value: "" } });

    expect(onAutoLockChange).toHaveBeenCalledWith(
      expect.objectContaining({ idleTimeoutMinutes: undefined }),
    );
  });

  it("ignores a non-integer or non-positive idle timeout instead of reporting it", () => {
    const { onAutoLockChange } = renderSettings();

    fireEvent.change(screen.getByLabelText(/lock after inactivity/i), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/lock after inactivity/i), { target: { value: "abc" } });

    expect(onAutoLockChange).not.toHaveBeenCalled();
  });

  it("steps a blank idle timeout up to 1 minute via the stepper button", () => {
    const { onAutoLockChange } = renderSettings();

    fireEvent.click(
      screen.getByRole("button", { name: /increase lock-after-inactivity minutes/i }),
    );

    expect(onAutoLockChange).toHaveBeenCalledWith(
      expect.objectContaining({ idleTimeoutMinutes: 1 }),
    );
  });

  it("steps an already-configured idle timeout up and down", () => {
    const { onAutoLockChange } = renderSettings({
      autoLock: { idleTimeoutMinutes: 10, lockOnMinimize: false, lockOnSleep: false },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /increase lock-after-inactivity minutes/i }),
    );
    expect(onAutoLockChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ idleTimeoutMinutes: 11 }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /decrease lock-after-inactivity minutes/i }),
    );
    expect(onAutoLockChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ idleTimeoutMinutes: 9 }),
    );
  });

  it("clears the idle timeout when stepping down from 1 minute", () => {
    const { onAutoLockChange } = renderSettings({
      autoLock: { idleTimeoutMinutes: 1, lockOnMinimize: false, lockOnSleep: false },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /decrease lock-after-inactivity minutes/i }),
    );

    expect(onAutoLockChange).toHaveBeenCalledWith(
      expect.objectContaining({ idleTimeoutMinutes: undefined }),
    );
  });

  it("ignores a decrease of an already-blank idle timeout", () => {
    const { onAutoLockChange } = renderSettings();

    fireEvent.click(
      screen.getByRole("button", { name: /decrease lock-after-inactivity minutes/i }),
    );

    expect(onAutoLockChange).not.toHaveBeenCalled();
  });

  it("toggles lock-on-minimize and lock-on-sleep independently", () => {
    const { onAutoLockChange } = renderSettings();

    fireEvent.click(screen.getByRole("checkbox", { name: /minimized/i }));
    expect(onAutoLockChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ lockOnMinimize: true, lockOnSleep: false }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /system sleeps/i }));
    expect(onAutoLockChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ lockOnMinimize: false, lockOnSleep: true }),
    );
  });

  it("shows the current content protection setting", () => {
    renderSettings({ contentProtection: false });

    expect(screen.getByRole("checkbox", { name: /screen sharing/i })).not.toBeChecked();
  });

  it("reports a content protection toggle", () => {
    const { onContentProtectionChange } = renderSettings({ contentProtection: true });

    fireEvent.click(screen.getByRole("checkbox", { name: /screen sharing/i }));

    expect(onContentProtectionChange).toHaveBeenCalledWith(false);
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
      await user.type(screen.getByLabelText("New password"), "new-pw");
      await user.type(screen.getByLabelText("Confirm new password"), "new-pw");
      await user.click(screen.getByRole("button", { name: /change master password/i }));

      expect(onChangeMasterPassword).toHaveBeenCalledWith("old-pw", "new-pw");
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
      const { onAccentColorChange } = renderSettings();

      fireEvent.click(screen.getByRole("radio", { name: "Purple" }));

      expect(onAccentColorChange).toHaveBeenCalledWith({ kind: "preset", id: "purple" });
    });

    it("does not show the hue slider while a preset is selected", () => {
      renderSettings();

      expect(screen.queryByLabelText(/custom color/i)).not.toBeInTheDocument();
    });

    it("switches to custom, seeded from the current preset's hue, when Custom is chosen", () => {
      const { onAccentColorChange } = renderSettings({
        accentColor: { kind: "preset", id: "teal" },
      });

      fireEvent.click(screen.getByRole("radio", { name: "Custom" }));

      expect(onAccentColorChange).toHaveBeenCalledWith({ kind: "custom", hue: 195 });
    });

    it("shows the hue slider at the current hue once custom is active", () => {
      renderSettings({ accentColor: { kind: "custom", hue: 88 } });

      expect(screen.getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByLabelText(/custom color/i)).toHaveValue("88");
    });

    it("reports a new hue as the slider moves", () => {
      const { onAccentColorChange } = renderSettings({ accentColor: { kind: "custom", hue: 88 } });

      fireEvent.change(screen.getByLabelText(/custom color/i), { target: { value: "210" } });

      expect(onAccentColorChange).toHaveBeenCalledWith({ kind: "custom", hue: 210 });
    });
  });

  describe("theme", () => {
    it("marks the current theme as checked and the other as unchecked", () => {
      renderSettings({ theme: "light" });

      expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
    });

    it("reports a theme selection", () => {
      const { onThemeChange } = renderSettings({ theme: "dark" });

      fireEvent.click(screen.getByRole("radio", { name: "Light" }));

      expect(onThemeChange).toHaveBeenCalledWith("light");
    });

    it("reports switching back to dark", () => {
      const { onThemeChange } = renderSettings({ theme: "light" });

      fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

      expect(onThemeChange).toHaveBeenCalledWith("dark");
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
    });

    it("reflects a field that's been turned off", () => {
      renderSettings({
        entryFieldVisibility: { ...DEFAULT_ENTRY_FIELD_VISIBILITY, password: false },
      });

      expect(screen.getByRole("checkbox", { name: "Password" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Username" })).toBeChecked();
    });

    it("reports turning a field off and on again", () => {
      const { onEntryFieldVisibilityChange } = renderSettings();

      fireEvent.click(screen.getByRole("checkbox", { name: "Notes" }));

      expect(onEntryFieldVisibilityChange).toHaveBeenCalledWith(
        expect.objectContaining({ notes: false }),
      );

      cleanup();
      const second = renderSettings({
        entryFieldVisibility: { ...DEFAULT_ENTRY_FIELD_VISIBILITY, notes: false },
      });
      fireEvent.click(screen.getByRole("checkbox", { name: "Notes" }));

      expect(second.onEntryFieldVisibilityChange).toHaveBeenCalledWith(
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
});
