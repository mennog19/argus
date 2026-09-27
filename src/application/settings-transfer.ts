import {
  ACCENT_COLOR_PRESET_IDS,
  AccentColor,
  AppSettings,
  AutoLockSettings,
  ENTRY_FIELD_KEYS,
  EntryFieldVisibility,
  GROUP_DELETE_MODES,
  GroupDeleteMode,
  resolveSettings,
  THEMES,
  Theme,
} from "./settings";

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
    readonly clipboardClearSeconds: number;
    readonly contentProtection: boolean;
  };
  readonly groups: {
    readonly deleteMode: GroupDeleteMode;
  };
  readonly entryCreation: {
    readonly fieldVisibility: EntryFieldVisibility;
  };
}

/**
 * Thrown by `parsePortableSettings` when a file isn't usable. The message is
 * written for the user, since it is shown as-is on the settings screen.
 */
export class SettingsImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsImportError";
  }
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
    groupDeleteMode,
    entryFieldVisibility,
  } = resolveSettings(settings);
  return {
    format: PORTABLE_SETTINGS_FORMAT,
    version: PORTABLE_SETTINGS_VERSION,
    appearance: { theme, accentColor },
    security: {
      idleTimeoutMinutes: autoLock.idleTimeoutMinutes,
      lockOnMinimize: autoLock.lockOnMinimize,
      lockOnSleep: autoLock.lockOnSleep,
      clipboardClearSeconds,
      contentProtection,
    },
    groups: { deleteMode: groupDeleteMode },
    entryCreation: { fieldVisibility: entryFieldVisibility },
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
  };
  return {
    ...settings,
    theme: portable.appearance.theme,
    accentColor: portable.appearance.accentColor,
    autoLock,
    clipboardClearSeconds: portable.security.clipboardClearSeconds,
    contentProtection: portable.security.contentProtection,
    groupDeleteMode: portable.groups.deleteMode,
    entryFieldVisibility: portable.entryCreation.fieldVisibility,
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
      ),
      lockOnMinimize: parseBoolean(security.lockOnMinimize, "Lock when minimized"),
      lockOnSleep: parseBoolean(security.lockOnSleep, "Lock when the system sleeps"),
      clipboardClearSeconds: positiveInteger(
        security.clipboardClearSeconds,
        "Clipboard clear seconds",
      ),
      contentProtection: parseBoolean(security.contentProtection, "Screen-capture protection"),
    },
    groups: { deleteMode: oneOf(groups.deleteMode, GROUP_DELETE_MODES, "Group delete mode") },
    entryCreation: { fieldVisibility: parseFieldVisibility(entryCreation.fieldVisibility) },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function section(raw: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = raw[name];
  if (!isRecord(value)) {
    throw new SettingsImportError(`The "${name}" section is missing or malformed.`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new SettingsImportError(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new SettingsImportError(`${label} must be true or false.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new SettingsImportError(`${label} must be a whole number of at least 1.`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return positiveInteger(value, label);
}

function parseAccentColor(value: unknown): AccentColor {
  if (isRecord(value)) {
    if (value.kind === "preset") {
      return {
        kind: "preset",
        id: oneOf(value.id, ACCENT_COLOR_PRESET_IDS, "Accent color preset"),
      };
    }
    if (value.kind === "custom") {
      const hue = value.hue;
      if (typeof hue !== "number" || !Number.isInteger(hue) || hue < 0 || hue > 359) {
        throw new SettingsImportError("Custom accent color hue must be a whole number from 0-359.");
      }
      return { kind: "custom", hue };
    }
  }
  throw new SettingsImportError("Accent color is missing or malformed.");
}

function parseFieldVisibility(value: unknown): EntryFieldVisibility {
  if (!isRecord(value)) {
    throw new SettingsImportError("Entry creation field visibility is missing or malformed.");
  }
  const visibility: Record<string, boolean> = {};
  for (const key of ENTRY_FIELD_KEYS) {
    visibility[key] = parseBoolean(value[key], `Entry field "${key}"`);
  }
  return visibility as EntryFieldVisibility;
}
