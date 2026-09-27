import { describe, expect, it } from "vitest";
import { formatHotkey, HotkeyKeyEvent, hotkeyFromKeyPress } from "./hotkey-capture";

function press(code: string, modifiers: Partial<HotkeyKeyEvent> = {}): HotkeyKeyEvent {
  return {
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  };
}

describe("hotkeyFromKeyPress", () => {
  it("builds an accelerator from modifiers and a letter", () => {
    expect(hotkeyFromKeyPress(press("KeyA", { ctrlKey: true, shiftKey: true }))).toEqual({
      kind: "combo",
      accelerator: "Control+Shift+A",
    });
  });

  it("names every modifier", () => {
    expect(
      hotkeyFromKeyPress(
        press("Digit7", { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }),
      ),
    ).toEqual({ kind: "combo", accelerator: "Control+Alt+Shift+Super+7" });
  });

  it("uses the physical key, so Shift+1 is the 1 key rather than '!'", () => {
    expect(hotkeyFromKeyPress(press("Digit1", { shiftKey: true }))).toEqual({
      kind: "combo",
      accelerator: "Shift+1",
    });
  });

  it("keeps the code for keys whose name is already an accelerator key", () => {
    expect(hotkeyFromKeyPress(press("Space", { altKey: true }))).toEqual({
      kind: "combo",
      accelerator: "Alt+Space",
    });
    expect(hotkeyFromKeyPress(press("ArrowUp", { ctrlKey: true }))).toEqual({
      kind: "combo",
      accelerator: "Control+ArrowUp",
    });
  });

  it("allows a function key on its own", () => {
    expect(hotkeyFromKeyPress(press("F9"))).toEqual({ kind: "combo", accelerator: "F9" });
  });

  it("rejects a bare key, which would be swallowed from every other app", () => {
    expect(hotkeyFromKeyPress(press("KeyA"))).toEqual({
      kind: "rejected",
      reason: "Include Ctrl, Alt, Shift, or Win in the shortcut",
    });
  });

  it("waits while only a modifier is held", () => {
    expect(hotkeyFromKeyPress(press("ControlLeft", { ctrlKey: true }))).toEqual({
      kind: "pending",
    });
  });

  it("ignores keys the global-shortcut plugin can't bind", () => {
    expect(hotkeyFromKeyPress(press("AudioVolumeUp", { ctrlKey: true }))).toEqual({
      kind: "pending",
    });
  });
});

describe("formatHotkey", () => {
  it("spells modifiers the way the keyboard labels them", () => {
    expect(formatHotkey("Control+Alt+Shift+Super+A")).toBe("Ctrl + Alt + Shift + Win + A");
  });

  it("reads the default, platform-neutral accelerator as Ctrl", () => {
    expect(formatHotkey("CommandOrControl+Shift+A")).toBe("Ctrl + Shift + A");
  });

  it("shows punctuation and arrows as symbols and short names", () => {
    expect(formatHotkey("Control+Slash")).toBe("Ctrl + /");
    expect(formatHotkey("Alt+ArrowLeft")).toBe("Alt + Left");
  });
});
