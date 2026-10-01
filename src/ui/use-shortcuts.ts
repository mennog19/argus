import { createContext, useEffect, useRef } from "react";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  ShortcutAction,
  ShortcutBindings,
} from "../application/shortcuts";
import { hotkeyFromKeyPress } from "./hotkey-capture";

/** What each shortcut does right now. An action left out isn't available, and its keys are left alone. */
export type ShortcutHandlers = Readonly<Partial<Record<ShortcutAction, () => void>>>;

/** The user's bindings, for the screens that answer to a shortcut of their own. */
export const ShortcutsContext = createContext<ShortcutBindings>(DEFAULT_SHORTCUTS);

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * Runs the handler of whichever action the pressed combination is bound to.
 * When two actions share a combination, the first one in `SHORTCUT_ACTIONS`
 * that is available wins.
 */
export function useShortcuts(bindings: ShortcutBindings, handlers: ShortcutHandlers): void {
  // Read through a ref so a caller passing fresh handlers each render doesn't
  // take the listener down and put it back up.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Already claimed by whatever has focus, e.g. the box recording a new
      // shortcut. A key held down mustn't fire its action over and over.
      if (event.defaultPrevented || event.repeat) {
        return;
      }
      const press = hotkeyFromKeyPress(event, false);
      if (press.kind !== "combo") {
        return;
      }
      // With none of these held, the key is text for the field that has focus.
      const typing = !event.ctrlKey && !event.altKey && !event.metaKey;
      if (typing && isTextField(event.target)) {
        return;
      }
      const run = SHORTCUT_ACTIONS.filter((action) => bindings[action] === press.accelerator)
        .map((action) => handlersRef.current[action])
        .find((handler) => handler !== undefined);
      if (run) {
        event.preventDefault();
        run();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [bindings]);
}
