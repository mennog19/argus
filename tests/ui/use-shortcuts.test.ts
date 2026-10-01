import { createEvent, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SHORTCUTS, ShortcutBindings } from "../../src/application/shortcuts";
import { ShortcutHandlers, useShortcuts } from "../../src/ui/use-shortcuts";

function press(target: Element | Document, init: KeyboardEventInit): boolean {
  const event = createEvent.keyDown(target, init);
  fireEvent(target, event);
  return event.defaultPrevented;
}

function field(tag: "input" | "textarea" | "select"): HTMLElement {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useShortcuts", () => {
  it("runs the action the pressed combination is bound to, and keeps the key from the webview", () => {
    const lock = vi.fn();
    renderHook(() => useShortcuts(DEFAULT_SHORTCUTS, { lock }));

    expect(press(document, { code: "KeyL", ctrlKey: true })).toBe(true);

    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("leaves a combination nothing is bound to alone", () => {
    const lock = vi.fn();
    renderHook(() => useShortcuts(DEFAULT_SHORTCUTS, { lock }));

    expect(press(document, { code: "KeyL", ctrlKey: true, altKey: true })).toBe(false);
    expect(press(document, { code: "ControlLeft", ctrlKey: true })).toBe(false);

    expect(lock).not.toHaveBeenCalled();
  });

  it("leaves the keys of an action that isn't available alone", () => {
    renderHook(() => useShortcuts(DEFAULT_SHORTCUTS, {}));

    expect(press(document, { code: "KeyL", ctrlKey: true })).toBe(false);
  });

  it("follows the user's own bindings", () => {
    const lock = vi.fn();
    const bindings: ShortcutBindings = { ...DEFAULT_SHORTCUTS, lock: "Alt+Shift+L" };
    renderHook(() => useShortcuts(bindings, { lock }));

    press(document, { code: "KeyL", ctrlKey: true });
    expect(lock).not.toHaveBeenCalled();

    press(document, { code: "KeyL", altKey: true, shiftKey: true });
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("gives a shared combination to the first action that is available", () => {
    const newEntry = vi.fn();
    const editEntry = vi.fn();
    const bindings: ShortcutBindings = {
      ...DEFAULT_SHORTCUTS,
      lock: "Control+K",
      newEntry: "Control+K",
      editEntry: "Control+K",
    };
    renderHook(() => useShortcuts(bindings, { newEntry, editEntry }));

    press(document, { code: "KeyK", ctrlKey: true });

    expect(newEntry).toHaveBeenCalledTimes(1);
    expect(editEntry).not.toHaveBeenCalled();
  });

  it("doesn't fire again while the key is held down", () => {
    const lock = vi.fn();
    renderHook(() => useShortcuts(DEFAULT_SHORTCUTS, { lock }));

    press(document, { code: "KeyL", ctrlKey: true, repeat: true });

    expect(lock).not.toHaveBeenCalled();
  });

  it("stays out of a key press something else already claimed", () => {
    const lock = vi.fn();
    renderHook(() => useShortcuts(DEFAULT_SHORTCUTS, { lock }));
    const event = createEvent.keyDown(document, { code: "KeyL", ctrlKey: true });
    event.preventDefault();

    fireEvent(document, event);

    expect(lock).not.toHaveBeenCalled();
  });

  it.each(["input", "textarea", "select"] as const)(
    "treats a key with no Ctrl, Alt or Win as text while a %s has focus",
    (tag) => {
      const deleteEntry = vi.fn();
      const togglePassword = vi.fn();
      const bindings: ShortcutBindings = { ...DEFAULT_SHORTCUTS, togglePassword: "Shift+H" };
      renderHook(() => useShortcuts(bindings, { deleteEntry, togglePassword }));
      const target = field(tag);

      expect(press(target, { code: "Delete", bubbles: true })).toBe(false);
      expect(press(target, { code: "KeyH", shiftKey: true, bubbles: true })).toBe(false);

      expect(deleteEntry).not.toHaveBeenCalled();
      expect(togglePassword).not.toHaveBeenCalled();
    },
  );

  it("still answers to Ctrl, Alt and Win combinations while a text field has focus", () => {
    const handlers = { lock: vi.fn(), newEntry: vi.fn(), editEntry: vi.fn() };
    const bindings: ShortcutBindings = {
      ...DEFAULT_SHORTCUTS,
      newEntry: "Alt+N",
      editEntry: "Super+E",
    };
    renderHook(() => useShortcuts(bindings, handlers));
    const target = field("input");

    press(target, { code: "KeyL", ctrlKey: true, bubbles: true });
    press(target, { code: "KeyN", altKey: true, bubbles: true });
    press(target, { code: "KeyE", metaKey: true, bubbles: true });

    expect(handlers.lock).toHaveBeenCalledTimes(1);
    expect(handlers.newEntry).toHaveBeenCalledTimes(1);
    expect(handlers.editEntry).toHaveBeenCalledTimes(1);
  });

  it("answers to a bare key when focus is anywhere but a text field", () => {
    const deleteEntry = vi.fn();
    renderHook(() => useShortcuts(DEFAULT_SHORTCUTS, { deleteEntry }));
    const button = document.createElement("button");
    document.body.append(button);

    press(button, { code: "Delete", bubbles: true });

    expect(deleteEntry).toHaveBeenCalledTimes(1);
  });

  it("uses the handlers of the latest render", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ handlers }: { handlers: ShortcutHandlers }) => useShortcuts(DEFAULT_SHORTCUTS, handlers),
      { initialProps: { handlers: { lock: first } } },
    );

    rerender({ handlers: { lock: second } });
    press(document, { code: "KeyL", ctrlKey: true });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops listening once unmounted", () => {
    const lock = vi.fn();
    const { unmount } = renderHook(() => useShortcuts(DEFAULT_SHORTCUTS, { lock }));

    unmount();
    press(document, { code: "KeyL", ctrlKey: true });

    expect(lock).not.toHaveBeenCalled();
  });
});
