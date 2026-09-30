import {
  AccentColor,
  AppSettings,
  AutoLockSettings,
  EntryFieldVisibility,
  DEFAULT_CLOSE_TO_TRAY,
  DEFAULT_EXPIRED_ENTRY_ACTION,
  EXPIRED_ENTRY_ACTIONS,
  ExpiredEntryAction,
  GROUP_DELETE_MODES,
  GroupDeleteMode,
  MAX_CLIPBOARD_CLEAR_SECONDS,
  MAX_IDLE_TIMEOUT_MINUTES,
  resolveSettings,
  THEMES,
  Theme,
} from "./settings";
import {
  isRecord,
  oneOf,
  optionalPositiveInteger,
  parseAccentColor,
  parseBoolean,
  parseOptionalBoolean,
  parseFieldVisibility,
  positiveInteger,
  SettingsImportError,
} from "./settings-validation";

export { SettingsImportError } from "./settings-validation";

/** Marker written into every exported file, so a random .json is rejected with a clear message. */
export const PORTABLE_SETTINGS_FORMAT = "argus-settings";

export const PORTABLE_SETTINGS_VERSION = 1;

/**
 * The shareable subset of `AppSettings`: everything the settings screen lets
 * the user configure, grouped the way that screen groups it. Deliberately
 * excludes the machine-local bits — `recentVaults` would leak the paths of
 * the sender's own vaults to whoever they send the file to.
 */
export interface PortableSettings {
  readonly format: typeof PORTABLE_SETTINGS_FORMAT;
  readonly version: number;
  readonly appearance: {
    readonly theme: Theme;
    readonly accentColor: AccentColor;
  };
  readonly security: {
    /** Absent means idle-timeout locking is off, matching `AutoLockSettings`. */
    readonly idleTimeoutMinutes?: number;
    readonly lockOnMinimize: boolean;
    readonly lockOnSleep: boolean;
    readonly lockOnSessionLock: boolean;
    readonly clipboardClearSeconds: number;
    readonly contentProtection: boolean;
  };
  readonly window: {
    readonly closeToTray: boolean;
  };
  readonly groups: {
    readonly deleteMode: GroupDeleteMode;
  };
  readonly entryCreation: {
    readonly fieldVisibility: EntryFieldVisibility;
  };
  readonly entries: {
    readonly expiredAction: ExpiredEntryAction;
  };
}

/**
 * Snapshots the shareable settings, resolving every "not set yet" value to
 * the default it currently behaves as, so the exported file describes the
 * app the sender actually sees rather than a half-empty object.
 */
export function toPortableSettings(settings: AppSettings): PortableSettings {
  const {
    theme,
    accentColor,
    autoLock,
    clipboardClearSeconds,
    contentProtection,
    closeToTray,
    groupDeleteMode,
    entryFieldVisibility,
    expiredEntryAction,
  } = resolveSettings(settings);
  return {
    format: PORTABLE_SETTINGS_FORMAT,
    version: PORTABLE_SETTINGS_VERSION,
    appearance: { theme, accentColor },
    security: {
      idleTimeoutMinutes: autoLock.idleTimeoutMinutes,
      lockOnMinimize: autoLock.lockOnMinimize,
      lockOnSleep: autoLock.lockOnSleep,
      lockOnSessionLock: autoLock.lockOnSessionLock,
      clipboardClearSeconds,
      contentProtection,
    },
    window: { closeToTray },
    groups: { deleteMode: groupDeleteMode },
    entryCreation: { fieldVisibility: entryFieldVisibility },
    entries: { expiredAction: expiredEntryAction },
  };
}

/** The JSON text written to the exported file. */
export function serializePortableSettings(portable: PortableSettings): string {
  return `${JSON.stringify(portable, null, 2)}\n`;
}

/**
 * Overwrites every shareable setting with the imported ones, wholesale.
 * `recentVaults` and the generator policy are machine-local, so they survive
 * an import untouched.
 */
export function applyPortableSettings(
  settings: AppSettings,
  portable: PortableSettings,
): AppSettings {
  const autoLock: AutoLockSettings = {
    idleTimeoutMinutes: portable.security.idleTimeoutMinutes,
    lockOnMinimize: portable.security.lockOnMinimize,
    lockOnSleep: portable.security.lockOnSleep,
    lockOnSessionLock: portable.security.lockOnSessionLock,
  };
  return {
    ...settings,
    theme: portable.appearance.theme,
    accentColor: portable.appearance.accentColor,
    autoLock,
    clipboardClearSeconds: portable.security.clipboardClearSeconds,
    contentProtection: portable.security.contentProtection,
    closeToTray: portable.window.closeToTray,
    groupDeleteMode: portable.groups.deleteMode,
    entryFieldVisibility: portable.entryCreation.fieldVisibility,
    expiredEntryAction: portable.entries.expiredAction,
  };
}

/**
 * Validates a settings file someone else may have written (or hand-edited)
 * field by field, so a malformed one is rejected with a message instead of
 * poisoning the app's own settings with nonsense.
 */
export function parsePortableSettings(text: string): PortableSettings {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SettingsImportError("That file is not valid JSON.");
  }

  if (!isRecord(raw) || raw.format !== PORTABLE_SETTINGS_FORMAT) {
    throw new SettingsImportError("That file is not an Argus settings file.");
  }
  if (raw.version !== PORTABLE_SETTINGS_VERSION) {
    throw new SettingsImportError(
      "That settings file was written by a different version of Argus and cannot be imported.",
    );
  }

  const appearance = section(raw, "appearance");
  const security = section(raw, "security");
  const groups = section(raw, "groups");
  const entryCreation = section(raw, "entryCreation");
  // Added after version 1 files were already being exported.
  const entries = raw.entries === undefined ? {} : section(raw, "entries");
  const windowSection = raw.window === undefined ? {} : section(raw, "window");

  return {
    format: PORTABLE_SETTINGS_FORMAT,
    version: PORTABLE_SETTINGS_VERSION,
    appearance: {
      theme: oneOf(appearance.theme, THEMES, "Theme"),
      accentColor: parseAccentColor(appearance.accentColor),
    },
    security: {
      idleTimeoutMinutes: optionalPositiveInteger(
        security.idleTimeoutMinutes,
        "Lock-after-inactivity minutes",
        MAX_IDLE_TIMEOUT_MINUTES,
      ),
      lockOnMinimize: parseBoolean(security.lockOnMinimize, "Lock when minimized"),
      lockOnSleep: parseBoolean(security.lockOnSleep, "Lock when the system sleeps"),
      // Added after version 1 files were already being exported.
      lockOnSessionLock: parseOptionalBoolean(
        security.lockOnSessionLock,
        "Lock when the computer is locked",
        false,
      ),
      clipboardClearSeconds: positiveInteger(
        security.clipboardClearSeconds,
        "Clipboard clear seconds",
        MAX_CLIPBOARD_CLEAR_SECONDS,
      ),
      contentProtection: parseBoolean(security.contentProtection, "Screen-capture protection"),
    },
    window: {
      closeToTray: parseOptionalBoolean(
        windowSection.closeToTray,
        "Minimize to tray when closed",
        DEFAULT_CLOSE_TO_TRAY,
      ),
    },
    groups: { deleteMode: oneOf(groups.deleteMode, GROUP_DELETE_MODES, "Group delete mode") },
    entryCreation: { fieldVisibility: parseFieldVisibility(entryCreation.fieldVisibility) },
    entries: {
      expiredAction:
        entries.expiredAction === undefined
          ? DEFAULT_EXPIRED_ENTRY_ACTION
          : oneOf(entries.expiredAction, EXPIRED_ENTRY_ACTIONS, "Expired entry action"),
    },
  };
}

function section(raw: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = raw[name];
  if (!isRecord(value)) {
    throw new SettingsImportError(`The "${name}" section is missing or malformed.`);
  }
  return value;
}
