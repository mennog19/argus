import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SHORTCUTS, ShortcutBindings } from "../../../../src/application/shortcuts";
import { ShortcutsSection } from "../../../../src/ui/screens/settings/ShortcutsSection";

function renderSection(shortcuts: ShortcutBindings = DEFAULT_SHORTCUTS, autoTypeHotkey?: string) {
  const onSettingChange = vi.fn();
  render(
    <ShortcutsSection
      shortcuts={shortcuts}
      autoTypeHotkey={autoTypeHotkey}
      onSettingChange={onSettingChange}
    />,
  );
  return { onSettingChange };
}

async function record(label: string, init: KeyboardEventInit) {
  const field = screen.getByLabelText(label);
  await userEvent.click(field);
  fireEvent.keyDown(field, init);
  fireEvent.keyDown(field, { code: "Enter" });
}

describe("ShortcutsSection", () => {
  it("lists every shortcut with its current combination", () => {
    renderSection();

    expect(screen.getByLabelText("Lock the vault")).toHaveTextContent("Ctrl + L");
    expect(screen.getByLabelText("Copy password")).toHaveTextContent("Ctrl + Shift + C");
    expect(screen.getByLabelText("Delete the selected entry")).toHaveTextContent("Delete");
    expect(screen.getByLabelText("Open settings")).toHaveTextContent("Ctrl + ,");
  });

  it("shows no warning and no reset while everything is at its default", () => {
    renderSection();

    expect(screen.queryByText(/shortcuts in red/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset shortcuts" })).not.toBeInTheDocument();
    expect(document.querySelector(".hotkey-field-value.conflict")).toBeNull();
  });

  it("stores a rebound shortcut as the one thing that differs from the defaults", async () => {
    const { onSettingChange } = renderSection();

    await record("Lock the vault", { code: "KeyL", altKey: true });

    expect(onSettingChange).toHaveBeenCalledWith("shortcuts", { lock: "Alt+L" });
  });

  it("lets a shortcut be a key on its own", async () => {
    const { onSettingChange } = renderSection();

    await record("Open settings", { code: "F2" });
    await record("Edit the selected entry", { code: "Insert" });

    expect(onSettingChange).toHaveBeenCalledWith("shortcuts", { openSettings: "F2" });
    expect(onSettingChange).toHaveBeenCalledWith("shortcuts", { editEntry: "Insert" });
  });

  it("stores nothing once the last rebound shortcut is put back by hand", async () => {
    const { onSettingChange } = renderSection({ ...DEFAULT_SHORTCUTS, lock: "Alt+L" });

    await record("Lock the vault", { code: "KeyL", ctrlKey: true });

    expect(onSettingChange).toHaveBeenCalledWith("shortcuts", undefined);
  });

  it("offers to reset once something was rebound", async () => {
    const { onSettingChange } = renderSection({ ...DEFAULT_SHORTCUTS, lock: "Alt+L" });

    await userEvent.click(screen.getByRole("button", { name: "Reset shortcuts" }));

    expect(onSettingChange).toHaveBeenCalledWith("shortcuts", undefined);
  });

  it("marks both of two shortcuts that share a combination in red, and says why", () => {
    renderSection({ ...DEFAULT_SHORTCUTS, newEntry: "Control+L" });

    expect(screen.getByLabelText("Lock the vault")).toHaveClass("conflict");
    expect(screen.getByLabelText("New entry")).toHaveClass("conflict");
    expect(screen.getByLabelText("Copy username")).not.toHaveClass("conflict");
    expect(screen.getByText('Same as "New entry".')).toBeInTheDocument();
    expect(screen.getByText('Same as "Lock the vault".')).toBeInTheDocument();
    expect(screen.getByText(/shortcuts in red/i)).toBeInTheDocument();
  });

  it("marks a shortcut that would take over copying text", () => {
    renderSection({ ...DEFAULT_SHORTCUTS, copyPassword: "Control+C" });

    expect(screen.getByLabelText("Copy password")).toHaveClass("conflict");
    expect(screen.getByText("Already used for copying text.")).toBeInTheDocument();
  });

  it("marks a shortcut the auto-type hotkey would swallow", () => {
    renderSection({ ...DEFAULT_SHORTCUTS, copyUsername: "Control+Shift+A" }, "Control+Shift+A");

    expect(screen.getByLabelText("Copy username")).toHaveClass("conflict");
    expect(screen.getByText("Same as the auto-type hotkey.")).toBeInTheDocument();
  });
});
