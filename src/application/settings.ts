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
