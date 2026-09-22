import { PasswordPolicyOptions } from "../domain";

/** One vault the user has previously opened or created, most-recent first. */
export interface RecentVaultEntry {
  readonly path: string;
  readonly lastOpenedAt: string;
}

/** Auto-lock triggers, each independently toggleable. All off by default (opt-in). */
export interface AutoLockSettings {
  /** Minutes of inactivity before locking. Undefined means idle-timeout locking is disabled. */
  readonly idleTimeoutMinutes?: number;
  readonly lockOnMinimize: boolean;
  readonly lockOnSleep: boolean;
}

export const DEFAULT_AUTO_LOCK: AutoLockSettings = { lockOnMinimize: false, lockOnSleep: false };

/**
 * What deleting a group does with what's inside it: `"deleteContents"` moves
 * the group with its whole subtree into the recycle bin; `"keepContents"`
 * moves its entries and subgroups up into the parent group first.
 */
export type GroupDeleteMode = "deleteContents" | "keepContents";

export const DEFAULT_GROUP_DELETE_MODE: GroupDeleteMode = "deleteContents";

/** One of the app's built-in accent color presets (see `ui/accent-color.ts` for their hues). */
export type AccentColorPresetId = "blue" | "purple" | "pink" | "orange" | "green" | "teal";

/**
 * The app's accent color: one of the built-in presets, or a hue (0-359,
 * degrees) the user picked themselves via the custom color slider.
 */
export type AccentColor =
  | { readonly kind: "preset"; readonly id: AccentColorPresetId }
  | { readonly kind: "custom"; readonly hue: number };

export const DEFAULT_ACCENT_COLOR: AccentColor = { kind: "preset", id: "blue" };

/** The app's overall color scheme. */
export type Theme = "dark" | "light";

export const DEFAULT_THEME: Theme = "dark";

/**
 * Entry fields that can be individually hidden from the entry creation form.
 * Title is always shown (it's the only required field); Group falls back to
 * whichever group the entry is being created in when hidden.
 */
export type EntryFieldKey = "username" | "password" | "totp" | "url" | "notes" | "tags" | "group";

export type EntryFieldVisibility = Readonly<Record<EntryFieldKey, boolean>>;

export const DEFAULT_ENTRY_FIELD_VISIBILITY: EntryFieldVisibility = {
  username: true,
  password: true,
  totp: true,
  url: true,
  notes: true,
  tags: true,
  group: true,
};

export interface AppSettings {
  readonly recentVaults: readonly RecentVaultEntry[];
  /** Shared password generator settings, used by both the dedicated generator
   * screen and "generate for new entry". Undefined until the user changes a
   * setting for the first time, at which point `PasswordPolicy`'s own
   * defaults apply. */
  readonly generatorPolicy?: PasswordPolicyOptions;
  /** Seconds after a copy-to-clipboard before it's cleared automatically.
   * Undefined until the user changes it, at which point `DEFAULT_CLIPBOARD_CLEAR_SECONDS` applies. */
  readonly clipboardClearSeconds?: number;
  /** Undefined until the user changes it, at which point `DEFAULT_AUTO_LOCK` applies. */
  readonly autoLock?: AutoLockSettings;
  /** Undefined until the user changes it, at which point `DEFAULT_GROUP_DELETE_MODE` applies. */
  readonly groupDeleteMode?: GroupDeleteMode;
  /** Undefined until the user changes it, at which point `DEFAULT_ACCENT_COLOR` applies. */
  readonly accentColor?: AccentColor;
  /** Undefined until the user changes it, at which point `DEFAULT_THEME` applies. */
  readonly theme?: Theme;
  /** Which fields are shown on the entry creation form. Undefined until the
   * user changes it, at which point `DEFAULT_ENTRY_FIELD_VISIBILITY` applies.
   * Only applies to creating new entries; editing an existing entry always
   * shows all of its fields. */
  readonly entryFieldVisibility?: EntryFieldVisibility;
}

export const DEFAULT_SETTINGS: AppSettings = { recentVaults: [] };

export const DEFAULT_CLIPBOARD_CLEAR_SECONDS = 20;

/**
 * Reads/writes the local app settings file. Implemented in `infrastructure`
 * against the Tauri filesystem API.
 */
export interface SettingsStore {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
}

const DEFAULT_MAX_RECENT_VAULTS = 5;

/**
 * Returns settings with `path` recorded as the most recently opened vault:
 * moved (or added) to the front, deduplicated, and capped at `maxEntries`.
 */
export function recordVaultOpened(
  settings: AppSettings,
  path: string,
  openedAt: Date = new Date(),
  maxEntries: number = DEFAULT_MAX_RECENT_VAULTS,
): AppSettings {
  const withoutPath = settings.recentVaults.filter((entry) => entry.path !== path);
  const recentVaults = [{ path, lastOpenedAt: openedAt.toISOString() }, ...withoutPath].slice(
    0,
    maxEntries,
  );
  return { ...settings, recentVaults };
}

/** Returns settings with `policy` recorded as the shared generator settings. */
export function withGeneratorPolicy(
  settings: AppSettings,
  policy: PasswordPolicyOptions,
): AppSettings {
  return { ...settings, generatorPolicy: policy };
}

/** Returns settings with `seconds` recorded as the clipboard auto-clear delay. */
export function withClipboardClearSeconds(settings: AppSettings, seconds: number): AppSettings {
  return { ...settings, clipboardClearSeconds: seconds };
}

/** Returns settings with `autoLock` recorded as the auto-lock configuration. */
export function withAutoLock(settings: AppSettings, autoLock: AutoLockSettings): AppSettings {
  return { ...settings, autoLock };
}

/** Returns settings with `mode` recorded as the group delete behaviour. */
export function withGroupDeleteMode(settings: AppSettings, mode: GroupDeleteMode): AppSettings {
  return { ...settings, groupDeleteMode: mode };
}

/** Returns settings with `accentColor` recorded as the app's accent color. */
export function withAccentColor(settings: AppSettings, accentColor: AccentColor): AppSettings {
  return { ...settings, accentColor };
}

/** Returns settings with `theme` recorded as the app's color scheme. */
export function withTheme(settings: AppSettings, theme: Theme): AppSettings {
  return { ...settings, theme };
}

/** Returns settings with `visibility` recorded as the entry creation form's field visibility. */
export function withEntryFieldVisibility(
  settings: AppSettings,
  visibility: EntryFieldVisibility,
): AppSettings {
  return { ...settings, entryFieldVisibility: visibility };
}
