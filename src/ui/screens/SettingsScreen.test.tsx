import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AutoLockSettings, GroupDeleteMode } from "../../application/settings";
import { VaultFileInfo } from "../../application/vault-access-service";
import { SettingsScreen } from "./SettingsScreen";

const DEFAULT_AUTO_LOCK: AutoLockSettings = { lockOnMinimize: false, lockOnSleep: false };

function renderSettings(
  clipboardClearSeconds = 20,
  autoLock: AutoLockSettings = DEFAULT_AUTO_LOCK,
  groupDeleteMode: GroupDeleteMode = "deleteContents",
  filePath = "C:/vaults/personal.kdbx",
  fileInfo: VaultFileInfo | undefined = undefined,
  entryCount = 0,
) {
  const onClipboardClearSecondsChange = vi.fn();
  const onAutoLockChange = vi.fn();
  const onGroupDeleteModeChange = vi.fn();
  render(
    <SettingsScreen
      filePath={filePath}
      fileInfo={fileInfo}
      entryCount={entryCount}
      clipboardClearSeconds={clipboardClearSeconds}
      autoLock={autoLock}
      groupDeleteMode={groupDeleteMode}
      onClipboardClearSecondsChange={onClipboardClearSecondsChange}
      onAutoLockChange={onAutoLockChange}
      onGroupDeleteModeChange={onGroupDeleteModeChange}
    />,
  );
  return { onClipboardClearSecondsChange, onAutoLockChange, onGroupDeleteModeChange };
}

describe("SettingsScreen", () => {
  it("shows the vault file name and placeholders while file info hasn't loaded yet", () => {
    renderSettings(20, DEFAULT_AUTO_LOCK, "deleteContents", "C:/vaults/personal.kdbx", undefined);

    expect(screen.getByText("personal.kdbx")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows the number of stored passwords", () => {
    renderSettings(
      20,
      DEFAULT_AUTO_LOCK,
      "deleteContents",
      "C:/vaults/personal.kdbx",
      undefined,
      7,
    );

    expect(screen.getByText("Passwords")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows the vault's size and last-saved time once file info loads", () => {
    const fileInfo: VaultFileInfo = { sizeBytes: 49152, lastModifiedMs: Date.now() };
    renderSettings(20, DEFAULT_AUTO_LOCK, "deleteContents", "C:/vaults/personal.kdbx", fileInfo);

    expect(screen.getByText("48 KB")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("shows the current group delete mode", () => {
    renderSettings(20, DEFAULT_AUTO_LOCK, "keepContents");

    expect(screen.getByRole("radio", { name: /keep its entries/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /delete its entries/i })).not.toBeChecked();
  });

  it("reports a group delete mode change in either direction", () => {
    const { onGroupDeleteModeChange } = renderSettings();

    fireEvent.click(screen.getByRole("radio", { name: /keep its entries/i }));
    expect(onGroupDeleteModeChange).toHaveBeenLastCalledWith("keepContents");

    cleanup();
    const second = renderSettings(20, DEFAULT_AUTO_LOCK, "keepContents");
    fireEvent.click(screen.getByRole("radio", { name: /delete its entries/i }));
    expect(second.onGroupDeleteModeChange).toHaveBeenLastCalledWith("deleteContents");
  });

  it("shows the current clipboard clear delay", () => {
    renderSettings(30);

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
    renderSettings(20, { idleTimeoutMinutes: 15, lockOnMinimize: true, lockOnSleep: true });

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
    const { onAutoLockChange } = renderSettings(20, {
      idleTimeoutMinutes: 10,
      lockOnMinimize: false,
      lockOnSleep: false,
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
});
