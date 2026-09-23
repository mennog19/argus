/**
 * Turns keyboard events into the accelerator strings Tauri's global-shortcut
 * plugin registers (`"Control+Shift+A"`), and back into text people read.
 *
 * Keys are identified by `KeyboardEvent.code` — the physical key — so a
 * combination means the same thing on every layout, and Shift or Alt can't
 * change which key was pressed ("Shift+1" is Digit1, not "!").
 */

/** The parts of a `KeyboardEvent` a hotkey is built from. */
export interface HotkeyKeyEvent {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

/** What one key press contributes to a hotkey being recorded. */
export type HotkeyKeyPress =
  /** Nothing usable yet: a modifier on its own, or a key that can't be bound. */
  | { readonly kind: "pending" }
  /** A real key, but the combination can't safely be a global hotkey. */
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "combo"; readonly accelerator: string };

/** Keys the global-shortcut plugin can bind, by `KeyboardEvent.code`. */
const BINDABLE_CODE =
  /^(Key[A-Z]|Digit\d|F\d{1,2}|Arrow(Up|Down|Left|Right)|Backquote|Backslash|BracketLeft|BracketRight|Comma|Equal|Minus|Period|Quote|Semicolon|Slash|Backspace|Delete|End|Enter|Home|Insert|PageDown|PageUp|Space|Tab)$/;

const FUNCTION_KEY = /^F\d{1,2}$/;

/** Shown in place of the raw accelerator token when the two read differently. */
const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Equal: "=",
  Minus: "-",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  Control: "Ctrl",
  CommandOrControl: "Ctrl",
  Super: "Win",
};

/** `"KeyA"` → `"A"`, `"Digit1"` → `"1"`; other codes are already valid accelerator keys. */
function keyToken(code: string): string {
  return code.replace(/^(Key|Digit)/, "");
}

/**
 * Interprets a key press while recording a hotkey. A global hotkey has to
 * include a modifier (or be a function key): a bare letter would be swallowed
 * from every application on the machine.
 */
export function hotkeyFromKeyPress(event: HotkeyKeyEvent): HotkeyKeyPress {
  if (!BINDABLE_CODE.test(event.code)) {
    return { kind: "pending" };
  }

  const modifiers = [
    event.ctrlKey && "Control",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Super",
  ].filter((modifier): modifier is string => modifier !== false);

  if (modifiers.length === 0 && !FUNCTION_KEY.test(event.code)) {
    return { kind: "rejected", reason: "Include Ctrl, Alt, Shift, or Win in the shortcut" };
  }

  return { kind: "combo", accelerator: [...modifiers, keyToken(event.code)].join("+") };
}

/** `"Control+Shift+A"` → `"Ctrl + Shift + A"`, for showing to people. */
export function formatHotkey(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => KEY_LABELS[part] ?? part)
    .join(" + ");
}
