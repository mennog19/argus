import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppSettings,
  ConfigurableSetting,
  DEFAULT_SETTINGS,
  EffectiveSettings,
  OpenedVaultLocation,
  recordVaultOpened,
  resolveSettings,
  SettingsStore,
  withSetting,
} from "../application/settings";
import {
  SettingsImportResult,
  SettingsTransferService,
} from "../application/settings-transfer-service";
import { SettingChangeHandler } from "./setting-change";

export interface AppSettingsState {
  readonly settings: AppSettings;
  /**
   * Resolved once here so that no screen below reads a raw `AppSettings` hole
   * and has to remember which default belongs to it.
   */
  readonly effective: EffectiveSettings;
  /**
   * Records one setting and persists the whole file. The write is
   * best-effort by design — losing a preference isn't worth interrupting what
   * the user was doing.
   */
  readonly changeSetting: SettingChangeHandler;
  /** Moves the vault to the top of the recent-vaults list; also best-effort. */
  readonly recordVaultOpened: (opened: OpenedVaultLocation) => Promise<void>;
  readonly exportSettings: () => Promise<string | undefined>;
  /**
   * Persists the imported settings before applying them, so a failed write
   * surfaces as an error on the settings screen instead of leaving the app
   * showing settings that would be gone again on the next launch.
   */
  readonly importSettings: () => Promise<SettingsImportResult | undefined>;
}

/**
 * The app's settings, loaded once from `store`. `onLoaded` runs after a
 * successful load; a failed load leaves the defaults in place.
 */
export function useAppSettings(
  store: SettingsStore,
  transfer: SettingsTransferService,
  onLoaded: (settings: AppSettings) => void,
): AppSettingsState {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const effective = useMemo(() => resolveSettings(settings), [settings]);

  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    void store
      .load()
      .then((loaded) => {
        setSettings(loaded);
        onLoadedRef.current(loaded);
      })
      .catch(() => {
        // Stay on the welcome screen with default settings if loading fails.
      });
  }, [store]);

  async function saveBestEffort(updated: AppSettings) {
    setSettings(updated);
    try {
      await store.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  function changeSetting<K extends ConfigurableSetting>(key: K, value: AppSettings[K]) {
    void saveBestEffort(withSetting(settings, key, value));
  }

  return {
    settings,
    effective,
    changeSetting,
    recordVaultOpened: (opened) => saveBestEffort(recordVaultOpened(settings, opened)),
    exportSettings: () => transfer.exportSettings(settings),
    importSettings: async () => {
      const imported = await transfer.importSettings(settings);
      if (!imported) {
        return undefined;
      }
      await store.save(imported.settings);
      setSettings(imported.settings);
      return { filePath: imported.filePath, keptContentProtection: imported.keptContentProtection };
    },
  };
}
