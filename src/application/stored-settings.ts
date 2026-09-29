import { PasswordPolicy, PasswordPolicyOptions } from "../domain";
import {
  AppSettings,
  AutoLockSettings,
  AutoTypeSettings,
  DEFAULT_SETTINGS,
  ENTRY_SORT_IDS,
  GROUP_DELETE_MODES,
  MAX_CLIPBOARD_CLEAR_SECONDS,
  MAX_IDLE_TIMEOUT_MINUTES,
  RecentVaultEntry,
  THEMES,
} from "./settings";
import {
  isRecord,
  oneOf,
  optionalPositiveInteger,
  parseAccentColor,
  parseBoolean,
  parseFieldVisibility,
  positiveInteger,
  SettingsImportError,
} from "./settings-validation";

/**
 * Reads the app's own settings file, validating it field by field.
 *
 * Unlike an import, nothing here is shown to the user: a field that's
 * missing or malformed (a hand edit, a file from a newer version, a partial
 * write) is dropped, so it falls back to its default through
 * `resolveSettings` while the rest of the file still applies. Text that
 * isn't a JSON object at all yields `DEFAULT_SETTINGS`.
 */
export function parseStoredSettings(text: string): AppSettings {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!isRecord(raw)) {
    return DEFAULT_SETTINGS;
  }

  return {
    recentVaults: parseRecentVaults(raw.recentVaults),
    generatorPolicy: lenient(raw.generatorPolicy, parseGeneratorPolicy),
    clipboardClearSeconds: lenient(raw.clipboardClearSeconds, (value) =>
      positiveInteger(value, "clipboardClearSeconds", MAX_CLIPBOARD_CLEAR_SECONDS),
    ),
    autoLock: lenient(raw.autoLock, parseAutoLock),
    autoType: lenient(raw.autoType, parseAutoType),
    groupDeleteMode: lenient(raw.groupDeleteMode, (value) =>
      oneOf(value, GROUP_DELETE_MODES, "groupDeleteMode"),
    ),
    accentColor: lenient(raw.accentColor, parseAccentColor),
    theme: lenient(raw.theme, (value) => oneOf(value, THEMES, "theme")),
    contentProtection: lenient(raw.contentProtection, (value) =>
      parseBoolean(value, "contentProtection"),
    ),
    entryFieldVisibility: lenient(raw.entryFieldVisibility, parseFieldVisibility),
    entrySort: lenient(raw.entrySort, (value) => oneOf(value, ENTRY_SORT_IDS, "entrySort")),
  };
}

/** `parse(value)`, or `undefined` when the value is absent or `parse` rejects it. */
function lenient<T>(value: unknown, parse: (value: unknown) => T): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return parse(value);
  } catch {
    return undefined;
  }
}

/** Keeps the well-formed entries; one bad entry doesn't cost the whole list. */
function parseRecentVaults(value: unknown): readonly RecentVaultEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (entry): entry is RecentVaultEntry =>
        isRecord(entry) && typeof entry.path === "string" && typeof entry.lastOpenedAt === "string",
    )
    .map(({ path, lastOpenedAt, keyFilePath }) => ({
      path,
      lastOpenedAt,
      // A malformed key file path costs only itself, not the whole entry.
      ...(typeof keyFilePath === "string" ? { keyFilePath } : {}),
    }));
}

function parseAutoLock(value: unknown): AutoLockSettings {
  if (!isRecord(value)) {
    throw new SettingsImportError("autoLock is malformed.");
  }
  return {
    idleTimeoutMinutes: optionalPositiveInteger(
      value.idleTimeoutMinutes,
      "idleTimeoutMinutes",
      MAX_IDLE_TIMEOUT_MINUTES,
    ),
    lockOnMinimize: parseBoolean(value.lockOnMinimize, "lockOnMinimize"),
    lockOnSleep: parseBoolean(value.lockOnSleep, "lockOnSleep"),
  };
}

function parseAutoType(value: unknown): AutoTypeSettings {
  if (!isRecord(value) || typeof value.hotkey !== "string" || value.hotkey === "") {
    throw new SettingsImportError("autoType is malformed.");
  }
  return { enabled: parseBoolean(value.enabled, "autoType.enabled"), hotkey: value.hotkey };
}

function parseGeneratorPolicy(value: unknown): PasswordPolicyOptions {
  if (!isRecord(value)) {
    throw new SettingsImportError("generatorPolicy is malformed.");
  }
  const field = <T>(key: string, parse: (value: unknown) => T): T | undefined =>
    value[key] === undefined ? undefined : parse(value[key]);
  // Keys this build doesn't know are dropped rather than rejected: settings
  // from a build that still had the passphrase mode keep their character
  // settings instead of losing the whole policy.
  const options: PasswordPolicyOptions = {
    length: field("length", (length) => positiveInteger(length, "length")),
    useUppercase: field("useUppercase", (flag) => parseBoolean(flag, "useUppercase")),
    useLowercase: field("useLowercase", (flag) => parseBoolean(flag, "useLowercase")),
    useDigits: field("useDigits", (flag) => parseBoolean(flag, "useDigits")),
    useSymbols: field("useSymbols", (flag) => parseBoolean(flag, "useSymbols")),
    excludeAmbiguous: field("excludeAmbiguous", (flag) => parseBoolean(flag, "excludeAmbiguous")),
  };
  // Individually valid fields can still combine into a policy the generator
  // refuses (e.g. every character set turned off); this throws for those.
  new PasswordPolicy(options);
  return options;
}
