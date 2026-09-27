import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HotkeyField } from "./HotkeyField";

function renderField(value = "CommandOrControl+Shift+A") {
  const onChange = vi.fn();
  render(<HotkeyField id="hotkey" value={value} onChange={onChange} />);
  return { onChange, field: screen.getByRole("button") };
}

function keyDown(
  field: HTMLElement,
  code: string,
  modifiers: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {},
) {
  fireEvent.keyDown(field, { code, ...modifiers });
}

describe("HotkeyField", () => {
  it("shows the current hotkey as plain text", () => {
    const { field } = renderField();

    expect(field).toHaveTextContent("Ctrl + Shift + A");
  });

  it("records a combination and keeps it on Enter", async () => {
    const { field, onChange } = renderField();

    await userEvent.click(field);
    expect(field).toHaveTextContent("Press a shortcut…");
    keyDown(field, "KeyK", { ctrlKey: true, altKey: true });
    expect(field).toHaveTextContent("Ctrl + Alt + K");
    expect(onChange).not.toHaveBeenCalled();
    keyDown(field, "Enter");

    expect(onChange).toHaveBeenCalledWith("Control+Alt+K");
    expect(field).toHaveTextContent("Ctrl + Shift + A");
  });

  it("uses the most recent combination when several are tried", async () => {
    const { field, onChange } = renderField();

    await userEvent.click(field);
    keyDown(field, "KeyK", { ctrlKey: true });
    keyDown(field, "KeyJ", { altKey: true });
    keyDown(field, "Enter");

    expect(onChange).toHaveBeenCalledWith("Alt+J");
  });

  it("lets a combination that includes Enter be recorded", async () => {
    const { field, onChange } = renderField();

    await userEvent.click(field);
    keyDown(field, "Enter", { ctrlKey: true });
    keyDown(field, "Enter");

    expect(onChange).toHaveBeenCalledWith("Control+Enter");
  });

  it("does nothing on Enter until a combination has been pressed", async () => {
    const { field, onChange } = renderField();

    await userEvent.click(field);
    keyDown(field, "Enter");

    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveTextContent("Press a shortcut…");
  });

  it("discards the recording on Escape", async () => {
    const { field, onChange } = renderField();

    await userEvent.click(field);
    keyDown(field, "KeyK", { ctrlKey: true });
    keyDown(field, "Escape");

    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveTextContent("Ctrl + Shift + A");
  });

  it("discards the recording when focus leaves", async () => {
    const { field, onChange } = renderField();

    await userEvent.click(field);
    keyDown(field, "KeyK", { ctrlKey: true });
    fireEvent.blur(field);

    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveTextContent("Ctrl + Shift + A");
  });

  it("explains why a bare key is refused, and clears that once a valid combo is pressed", async () => {
    const { field } = renderField();

    await userEvent.click(field);
    keyDown(field, "KeyK");
    expect(screen.getByText(/Include Ctrl, Alt, Shift, or Win/)).toBeInTheDocument();
    keyDown(field, "KeyK", { ctrlKey: true });

    expect(screen.queryByText(/Include Ctrl, Alt, Shift, or Win/)).not.toBeInTheDocument();
    expect(screen.getByText("Enter to save · Esc to cancel")).toBeInTheDocument();
  });

  it("ignores a modifier pressed on its own", async () => {
    const { field } = renderField();

    await userEvent.click(field);
    keyDown(field, "ControlLeft", { ctrlKey: true });

    expect(field).toHaveTextContent("Press a shortcut…");
    expect(screen.getByText("Esc to cancel")).toBeInTheDocument();
  });

  it("keeps the key event to itself while recording, so Tab can't move focus away", async () => {
    const { field } = renderField();

    await userEvent.click(field);

    expect(fireEvent.keyDown(field, { code: "Tab" })).toBe(false);
  });

  it("leaves key events alone when not recording", () => {
    const { field, onChange } = renderField();

    expect(fireEvent.keyDown(field, { code: "Tab" })).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
