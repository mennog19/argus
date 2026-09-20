/** One vault the user has previously opened or created, most-recent first. */
export interface RecentVaultEntry {
  readonly path: string;
  readonly lastOpenedAt: string;
}

export interface AppSettings {
  readonly recentVaults: readonly RecentVaultEntry[];
}

export const DEFAULT_SETTINGS: AppSettings = { recentVaults: [] };

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
