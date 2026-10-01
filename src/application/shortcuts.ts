/**
 * The keyboard shortcuts that work inside Argus's own window, as opposed to
 * the auto-type hotkey, which is registered with the OS.
 *
 * A shortcut is an accelerator string in the form the hotkey recorder
 * produces: modifiers in a fixed order, then one key, joined by `+`
 * (`"Control+Shift+C"`). Keys are named by their physical position, as
 * `KeyboardEvent.code` does, so a binding means the same key on every layout.
 */

/** In the order the settings screen lists them, and the order a clash is settled in. */
export const SHORTCUT_ACTIONS = [
  "lock",
  "newEntry",
  "editEntry",
  "saveEntry",
  "deleteEntry",
  "copyUsername",
  "copyPassword",
  "copyTotp",
  "copyUrl",
  "openUrl",
  "togglePassword",
  "openGenerator",
  "openSettings",
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export type ShortcutBindings = Readonly<Record<ShortcutAction, string>>;

/** The bindings the user changed; every other action keeps its default. */
export type ShortcutOverrides = Readonly<Partial<Record<ShortcutAction, string>>>;

/**
 * KeePassXC's bindings where it has one, so both apps answer to the same
 * keys. The exception is copying the password, which KeePassXC puts on
 * Ctrl+C: here that would copy the password whenever someone meant to copy
 * the text they had selected.
 */
export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  lock: "Control+L",
  newEntry: "Control+N",
  editEntry: "Control+E",
  saveEntry: "Control+S",
  deleteEntry: "Delete",
  copyUsername: "Control+B",
  copyPassword: "Control+Shift+C",
  copyTotp: "Control+T",
  copyUrl: "Control+U",
  openUrl: "Control+Shift+U",
  togglePassword: "Control+H",
  openGenerator: "Control+G",
  openSettings: "Control+Comma",
};

export const SHORTCUT_LABELS: Readonly<Record<ShortcutAction, string>> = {
  lock: "Lock the vault",
  newEntry: "New entry",
  editEntry: "Edit the selected entry",
  saveEntry: "Save the entry being edited",
  deleteEntry: "Delete the selected entry",
  copyUsername: "Copy username",
  copyPassword: "Copy password",
  copyTotp: "Copy authenticator code",
  copyUrl: "Copy URL",
  openUrl: "Open URL in the browser",
  togglePassword: "Show or hide the password",
  openGenerator: "Open the password generator",
  openSettings: "Open settings",
};

const MODIFIERS = ["Control", "Alt", "Shift", "Super"] as const;

/** The spellings a hand-edited settings file is likely to use, lower-cased. */
const MODIFIER_ALIASES: ReadonlyMap<string, (typeof MODIFIERS)[number]> = new Map([
  ["control", "Control"],
  ["ctrl", "Control"],
  ["commandorcontrol", "Control"],
  ["cmdorctrl", "Control"],
  ["alt", "Alt"],
  ["option", "Alt"],
  ["shift", "Shift"],
  ["super", "Super"],
  ["win", "Super"],
  ["meta", "Super"],
  ["cmd", "Super"],
  ["command", "Super"],
]);

const KEY =
  /^([A-Z]|\d|F\d{1,2}|Arrow(Up|Down|Left|Right)|Backquote|Backslash|BracketLeft|BracketRight|Comma|Equal|Minus|Period|Quote|Semicolon|Slash|Backspace|Delete|End|Enter|Home|Insert|PageDown|PageUp|Space|Tab)$/;

/**
 * `value` in the one spelling shortcuts are compared in, or `undefined` when
 * it isn't an accelerator: `"ctrl + shift + c"` and `"Shift+Control+C"` both
 * come back as `"Control+Shift+C"`.
 */
export function normalizeAccelerator(value: string): string | undefined {
  const parts = value.split("+").map((part) => part.trim());
  // `split` always yields at least one part.
  const last = parts.pop()!;
  const key = last.length === 1 ? last.toUpperCase() : last;
  if (!KEY.test(key)) {
    return undefined;
  }
  const held = new Set<string>();
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES.get(part.toLowerCase());
    if (modifier === undefined) {
      return undefined;
    }
    held.add(modifier);
  }
  return [...MODIFIERS.filter((modifier) => held.has(modifier)), key].join("+");
}

export function resolveShortcuts(overrides: ShortcutOverrides | undefined): ShortcutBindings {
  return { ...DEFAULT_SHORTCUTS, ...overrides };
}

/**
 * Only the bindings that differ from their defaults, or `undefined` when none
 * do, so that a later change to a default still reaches the actions the user
 * never rebound.
 */
export function shortcutOverrides(bindings: ShortcutBindings): ShortcutOverrides | undefined {
  const changed = SHORTCUT_ACTIONS.filter(
    (action) => bindings[action] !== DEFAULT_SHORTCUTS[action],
  );
  if (changed.length === 0) {
    return undefined;
  }
  return Object.fromEntries(changed.map((action) => [action, bindings[action]]));
}

/** Combinations that already do something in every text box, or in Argus itself. */
const RESERVED: ReadonlyMap<string, string> = new Map([
  ["Control+C", "copying text"],
  ["Control+X", "cutting text"],
  ["Control+V", "pasting"],
  ["Control+A", "selecting everything"],
  ["Control+Z", "undoing"],
  ["Control+Y", "redoing"],
  ["Control+F", "searching"],
]);

/**
 * Why each clashing action's shortcut can't be relied on, written for the
 * user. An action that isn't in the result has a combination to itself.
 * `autoTypeHotkey` is the auto-type hotkey while auto-type is on: the OS
 * hands that combination to auto-type before Argus's window ever sees it.
 */
export function shortcutConflicts(
  bindings: ShortcutBindings,
  autoTypeHotkey?: string,
): ReadonlyMap<ShortcutAction, string> {
  const autoType = autoTypeHotkey === undefined ? undefined : normalizeAccelerator(autoTypeHotkey);
  const conflicts = new Map<ShortcutAction, string>();
  for (const action of SHORTCUT_ACTIONS) {
    const accelerator = bindings[action];
    const reserved = RESERVED.get(accelerator);
    const sharedWith = SHORTCUT_ACTIONS.filter(
      (other) => other !== action && bindings[other] === accelerator,
    );
    if (reserved !== undefined) {
      conflicts.set(action, `Already used for ${reserved}.`);
    } else if (accelerator === autoType) {
      conflicts.set(action, "Same as the auto-type hotkey.");
    } else if (sharedWith.length > 0) {
      const others = sharedWith.map((other) => `"${SHORTCUT_LABELS[other]}"`).join(" and ");
      conflicts.set(action, `Same as ${others}.`);
    }
  }
  return conflicts;
}
