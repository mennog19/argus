import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsScreen } from "./SettingsScreen";

function renderSettings(clipboardClearSeconds = 20) {
  const onClipboardClearSecondsChange = vi.fn();
  render(
    <SettingsScreen
      clipboardClearSeconds={clipboardClearSeconds}
      onClipboardClearSecondsChange={onClipboardClearSecondsChange}
    />,
  );
  return { onClipboardClearSecondsChange };
}

describe("SettingsScreen", () => {
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
});
