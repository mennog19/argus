import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccentColor, AutoLockSettings, GroupDeleteMode, Theme } from "../../application/settings";
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
  } = {},
) {
  const onClipboardClearSecondsChange = vi.fn();
  const onAutoLockChange = vi.fn();
  const onGroupDeleteModeChange = vi.fn();
  const onAccentColorChange = vi.fn();
  const onThemeChange = vi.fn();
  render(
    <SettingsScreen
      filePath={overrides.filePath ?? "C:/vaults/personal.kdbx"}
      fileInfo={overrides.fileInfo}
      entryCount={overrides.entryCount ?? 0}
      clipboardClearSeconds={overrides.clipboardClearSeconds ?? 20}
      autoLock={overrides.autoLock ?? DEFAULT_AUTO_LOCK}
      groupDeleteMode={overrides.groupDeleteMode ?? "deleteContents"}
      accentColor={overrides.accentColor ?? DEFAULT_ACCENT_COLOR}
      theme={overrides.theme ?? "dark"}
      onClipboardClearSecondsChange={onClipboardClearSecondsChange}
      onAutoLockChange={onAutoLockChange}
      onGroupDeleteModeChange={onGroupDeleteModeChange}
      onAccentColorChange={onAccentColorChange}
      onThemeChange={onThemeChange}
    />,
  );
  return {
    onClipboardClearSecondsChange,
    onAutoLockChange,
    onGroupDeleteModeChange,
    onAccentColorChange,
    onThemeChange,
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
});
