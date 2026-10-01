import { PasswordPolicyOptions } from "../domain";
import { resolveShortcuts, ShortcutBindings, ShortcutOverrides } from "./shortcuts";

/** One vault the user has previously opened or created, most-recent first. */
export interface RecentVaultEntry {
  readonly path: string;
  readonly lastOpenedAt: string;
  /**
   * The key file it was last unlocked with, if it needs one, so unlocking it
   * again doesn't mean hunting the file down each time. Only the path is
   * kept, never the contents -- as KeePassXC does by default.
   */
  readonly keyFilePath?: string;
}

export interface OpenedVaultLocation {
  readonly path: string;
  readonly keyFilePath?: string;
}

/** Auto-lock triggers, each independently toggleable. All off by default (opt-in). */
export interface AutoLockSettings {
  /** Minutes of inactivity before locking. Undefined means idle-timeout locking is disabled. */
  readonly idleTimeoutMinutes?: number;
  readonly lockOnMinimize: boolean;
  readonly lockOnSleep: boolean;
  /** Lock when the OS session is locked (e.g. Win+L). */
  readonly lockOnSessionLock: boolean;
}

export const DEFAULT_AUTO_LOCK: AutoLockSettings = {
  lockOnMinimize: false,
  lockOnSleep: false,
  lockOnSessionLock: false,
};

/**
 * Auto-type: an OS-wide hotkey that types the credentials of a matching entry
 * into whatever application is focused. Off by default — it simulates
 * keyboard input into other programs, so it's opt-in like the auto-lock
 * triggers.
 */
export interface AutoTypeSettings {
  readonly enabled: boolean;
  /** A Tauri global-shortcut accelerator, e.g. `"CommandOrControl+Shift+A"`. */
  readonly hotkey: string;
}

export const DEFAULT_AUTO_TYPE: AutoTypeSettings = {
  enabled: false,
  hotkey: "CommandOrControl+Shift+A",
};

/**
 * What deleting a group does with what's inside it: `"deleteContents"` moves
 * the group with its whole subtree into the recycle bin; `"keepContents"`
 * moves its entries and subgroups up into the parent group first.
 */
export const GROUP_DELETE_MODES = ["deleteContents", "keepContents"] as const;

export type GroupDeleteMode = (typeof GROUP_DELETE_MODES)[number];

export const DEFAULT_GROUP_DELETE_MODE: GroupDeleteMode = "deleteContents";

/**
 * What happens to an entry once its expiry date passes: `"mark"` only flags
 * it as expired (KeePass's behavior); `"recycle"` moves it into the recycle
 * bin; `"delete"` removes it from the vault outright, history and all.
 */
export const EXPIRED_ENTRY_ACTIONS = ["mark", "recycle", "delete"] as const;

export type ExpiredEntryAction = (typeof EXPIRED_ENTRY_ACTIONS)[number];

export const DEFAULT_EXPIRED_ENTRY_ACTION: ExpiredEntryAction = "mark";

/** One of the app's built-in accent color presets (see `ui/accent-color.ts` for their hues). */
export const ACCENT_COLOR_PRESET_IDS = [
  "blue",
  "purple",
  "pink",
  "orange",
  "green",
  "teal",
] as const;

export type AccentColorPresetId = (typeof ACCENT_COLOR_PRESET_IDS)[number];

/**
 * The app's accent color: one of the built-in presets, or a hue (0-359,
 * degrees) the user picked themselves via the custom color slider.
 */
export type AccentColor =
  | { readonly kind: "preset"; readonly id: AccentColorPresetId }
  | { readonly kind: "custom"; readonly hue: number };

export const DEFAULT_ACCENT_COLOR: AccentColor = { kind: "preset", id: "blue" };

export const THEMES = ["dark", "light"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "dark";

/**
 * Whether the app window is excluded from screen recordings, screenshots,
 * and screen-share/remote-desktop apps (via the OS's window-capture-affinity
 * APIs). On by default: this is a password manager, so a capturable vault
 * window is the wrong default.
 */
export const DEFAULT_CONTENT_PROTECTION = true;

/**
 * Whether closing the window hides Argus to the system tray instead of
 * quitting. Off by default: the close button quits, like any other app.
 */
export const DEFAULT_CLOSE_TO_TRAY = false;

/**
 * Whether Argus asks GitHub for a newer version when it starts. Off by
 * default: it's the only network request Argus makes of its own, so the user
 * opts into it.
 */
export const DEFAULT_CHECK_FOR_UPDATES = false;

/**
 * Entry fields that can be individually hidden from the entry creation form.
 * Title is always shown (it's the only required field); Group falls back to
 * whichever group the entry is being created in when hidden.
 */
export const ENTRY_FIELD_KEYS = [
  "username",
  "password",
  "totp",
  "url",
  "notes",
  "tags",
  "group",
  "expiry",
] as const;

/**
 * Fields added after settings files without them were already written. A
 * file that leaves one out gets it at its default rather than being rejected.
 */
export const LATER_ENTRY_FIELD_KEYS: ReadonlySet<EntryFieldKey> = new Set(["expiry"]);

export type EntryFieldKey = (typeof ENTRY_FIELD_KEYS)[number];

export type EntryFieldVisibility = Readonly<Record<EntryFieldKey, boolean>>;

export const DEFAULT_ENTRY_FIELD_VISIBILITY: EntryFieldVisibility = {
  username: true,
  password: true,
  totp: true,
  url: true,
  notes: true,
  tags: true,
  group: true,
  expiry: true,
};

/**
 * How the entry list is ordered. `"manual"` is the vault's own order — the
 * order stored in the `.kdbx` file and shown by KeePass/KeePassXC, in which a
 * newly added or moved entry lands at the end of its group.
 */
export const ENTRY_SORT_IDS = [
  "manual",
  "title-asc",
  "title-desc",
  "accessed-desc",
  "accessed-asc",
] as const;

export type EntrySortId = (typeof ENTRY_SORT_IDS)[number];

export const DEFAULT_ENTRY_SORT: EntrySortId = "manual";

/**
 * The settings file. Every setting is undefined until the user first changes
 * it; `resolveSettings` fills those in with their defaults.
 */
export interface AppSettings {
  readonly recentVaults: readonly RecentVaultEntry[];
  /** Shared by the generator screen and "generate for new entry". */
  readonly generatorPolicy?: PasswordPolicyOptions;
  /** Seconds after a copy-to-clipboard before it's cleared automatically. */
  readonly clipboardClearSeconds?: number;
  readonly autoLock?: AutoLockSettings;
  /** Deliberately left out of the portable settings file: which hotkey is free
   * is a property of one machine, not of a user's preferences. */
  readonly autoType?: AutoTypeSettings;
  readonly groupDeleteMode?: GroupDeleteMode;
  readonly expiredEntryAction?: ExpiredEntryAction;
  readonly accentColor?: AccentColor;
  readonly theme?: Theme;
  readonly contentProtection?: boolean;
  readonly closeToTray?: boolean;
  /** Deliberately left out of the portable settings file: agreeing to network
   * requests is for the user of each machine, not something a file someone
   * sends them should switch on. */
  readonly checkForUpdates?: boolean;
  /** Only applies to creating new entries; editing an existing entry always
   * shows all of its fields. */
  readonly entryFieldVisibility?: EntryFieldVisibility;
  readonly entrySort?: EntrySortId;
  /** The in-app keyboard shortcuts the user rebound; the rest keep their defaults. */
  readonly shortcuts?: ShortcutOverrides;
}

export const DEFAULT_SETTINGS: AppSettings = { recentVaults: [] };

export const DEFAULT_CLIPBOARD_CLEAR_SECONDS = 20;

/**
 * Longest clipboard clear delay Argus accepts: 10 minutes. A copied password
 * left on the clipboard for longer is the leak the clear exists to prevent,
 * and an imported settings file mustn't be able to set it to days.
 */
export const MAX_CLIPBOARD_CLEAR_SECONDS = 600;

/** Longest idle timeout Argus accepts: 24 hours. Blank (off) is still allowed. */
export const MAX_IDLE_TIMEOUT_MINUTES = 24 * 60;

/** Every setting a user can change, i.e. everything but the recency list. */
export type ConfigurableSetting = Exclude<keyof AppSettings, "recentVaults">;

/**
 * Every setting resolved to the value the app actually behaves as.
 *
 * `AppSettings` is the shape of the settings *file*, where an absent field
 * means "the user has never touched this" — which is what lets a future
 * change to a default reach people who never overrode it. `EffectiveSettings`
 * is the shape the *app* reads, so that no screen has to remember which
 * default fills which hole, and a new setting can't be read raw by mistake.
 */
export interface EffectiveSettings {
  readonly generatorPolicy: PasswordPolicyOptions;
  readonly clipboardClearSeconds: number;
  readonly autoLock: AutoLockSettings;
  readonly autoType: AutoTypeSettings;
  readonly groupDeleteMode: GroupDeleteMode;
  readonly expiredEntryAction: ExpiredEntryAction;
  readonly accentColor: AccentColor;
  readonly theme: Theme;
  readonly contentProtection: boolean;
  readonly closeToTray: boolean;
  readonly checkForUpdates: boolean;
  readonly entryFieldVisibility: EntryFieldVisibility;
  readonly entrySort: EntrySortId;
  readonly shortcuts: ShortcutBindings;
}

/** Fills in every "not set yet" hole in `settings` with its default. */
export function resolveSettings(settings: AppSettings): EffectiveSettings {
  return {
    // `PasswordPolicy` applies its own defaults to an empty options object.
    generatorPolicy: settings.generatorPolicy ?? {},
    clipboardClearSeconds: settings.clipboardClearSeconds ?? DEFAULT_CLIPBOARD_CLEAR_SECONDS,
    autoLock: settings.autoLock ?? DEFAULT_AUTO_LOCK,
    autoType: settings.autoType ?? DEFAULT_AUTO_TYPE,
    groupDeleteMode: settings.groupDeleteMode ?? DEFAULT_GROUP_DELETE_MODE,
    expiredEntryAction: settings.expiredEntryAction ?? DEFAULT_EXPIRED_ENTRY_ACTION,
    accentColor: settings.accentColor ?? DEFAULT_ACCENT_COLOR,
    theme: settings.theme ?? DEFAULT_THEME,
    contentProtection: settings.contentProtection ?? DEFAULT_CONTENT_PROTECTION,
    closeToTray: settings.closeToTray ?? DEFAULT_CLOSE_TO_TRAY,
    checkForUpdates: settings.checkForUpdates ?? DEFAULT_CHECK_FOR_UPDATES,
    entryFieldVisibility: settings.entryFieldVisibility ?? DEFAULT_ENTRY_FIELD_VISIBILITY,
    entrySort: settings.entrySort ?? DEFAULT_ENTRY_SORT,
    shortcuts: resolveShortcuts(settings.shortcuts),
  };
}

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
 * Returns settings with `opened` recorded as the most recently opened vault:
 * moved (or added) to the front, deduplicated, and capped at `maxEntries`.
 * Its key file is replaced too, so unlocking without one forgets it.
 */
export function recordVaultOpened(
  settings: AppSettings,
  { path, keyFilePath }: OpenedVaultLocation,
  openedAt: Date = new Date(),
  maxEntries: number = DEFAULT_MAX_RECENT_VAULTS,
): AppSettings {
  const withoutPath = settings.recentVaults.filter((entry) => entry.path !== path);
  const entry: RecentVaultEntry = {
    path,
    lastOpenedAt: openedAt.toISOString(),
    ...(keyFilePath === undefined ? {} : { keyFilePath }),
  };
  const recentVaults = [entry, ...withoutPath].slice(0, maxEntries);
  return { ...settings, recentVaults };
}

/** Returns settings with `key` recorded as `value`. */
export function withSetting<K extends ConfigurableSetting>(
  settings: AppSettings,
  key: K,
  value: AppSettings[K],
): AppSettings {
  return { ...settings, [key]: value };
}
