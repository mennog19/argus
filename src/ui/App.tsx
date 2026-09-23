import { useEffect, useMemo, useState } from "react";
import { PasswordPolicyOptions, Vault } from "../domain";
import { hasClockJumped, hasIdleTimedOut } from "./auto-lock";
import { ClipboardWriter } from "../application/clipboard";
import {
  OpenedVault,
  VaultAccessService,
  VaultFileInfo,
  VaultSaveConflictError,
} from "../application/vault-access-service";
import { GlobalHotkey } from "../application/auto-type";
import { AutoTypeService } from "../application/auto-type-service";
import { WindowEvents } from "../application/window-events";
import { WindowProtection } from "../application/window-protection";
import {
  AccentColor,
  AppSettings,
  AutoLockSettings,
  AutoTypeSettings,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_AUTO_LOCK,
  DEFAULT_AUTO_TYPE,
  DEFAULT_CLIPBOARD_CLEAR_SECONDS,
  DEFAULT_CONTENT_PROTECTION,
  DEFAULT_ENTRY_FIELD_VISIBILITY,
  DEFAULT_ENTRY_SORT,
  DEFAULT_GROUP_DELETE_MODE,
  DEFAULT_SETTINGS,
  DEFAULT_THEME,
  EntryFieldVisibility,
  EntrySortId,
  GroupDeleteMode,
  recordVaultOpened,
  SettingsStore,
  Theme,
  withAccentColor,
  withAutoLock,
  withAutoType,
  withClipboardClearSeconds,
  withContentProtection,
  withEntryFieldVisibility,
  withEntrySort,
  withGeneratorPolicy,
  withGroupDeleteMode,
  withTheme,
} from "../application/settings";
import { SettingsTransferService } from "../application/settings-transfer-service";
import { UrlOpener } from "../application/url-opener";
import { VaultMergeSource } from "../application/vault-merge-source";
import { accentColorCssVars, accentColorHue } from "./accent-color";
import { collectAllEntries } from "./vault-browsing";
import { useAutoType } from "./use-auto-type";
import { AutoTypePicker } from "./screens/AutoTypePicker";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { LockedScreen } from "./screens/LockedScreen";
import { VaultShell } from "./screens/VaultShell";
import "./styles/theme.css";
import "./styles/shell.css";

interface AppProps {
  vaultAccessService: VaultAccessService;
  settingsStore: SettingsStore;
  settingsTransferService: SettingsTransferService;
  urlOpener: UrlOpener;
  clipboardWriter: ClipboardWriter;
  windowEvents: WindowEvents;
  windowProtection: WindowProtection;
  mergeSource: VaultMergeSource;
  autoTypeService: AutoTypeService;
  globalHotkey: GlobalHotkey;
}

const IDLE_CHECK_INTERVAL_MS = 10_000;
const SLEEP_CHECK_INTERVAL_MS = 15_000;
const SLEEP_CLOCK_JUMP_TOLERANCE_MS = 10_000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "scroll"] as const;

type Screen =
  | { kind: "welcome" }
  | { kind: "locked"; filePath: string }
  | { kind: "unlocked"; vault: Vault; filePath: string };

interface SaveConflict {
  nextVault: Vault;
  filePath: string;
}

function App({
  vaultAccessService,
  settingsStore,
  settingsTransferService,
  urlOpener,
  clipboardWriter,
  windowEvents,
  windowProtection,
  mergeSource,
  autoTypeService,
  globalHotkey,
}: AppProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>({ kind: "welcome" });
  const [conflict, setConflict] = useState<SaveConflict | undefined>(undefined);
  const [fileInfo, setFileInfo] = useState<VaultFileInfo | undefined>(undefined);

  const autoTypeSettings = settings.autoType ?? DEFAULT_AUTO_TYPE;

  // Everything auto-type is allowed to offer: the whole vault minus the
  // recycle bin, so a deleted login can't be typed back into a live site.
  const autoTypeEntries = useMemo(
    () =>
      screen.kind === "unlocked"
        ? collectAllEntries(
            screen.vault.rootGroup,
            screen.vault.recycleBin ? [screen.vault.recycleBin.id] : [],
          ).map(({ entry }) => entry)
        : [],
    [screen],
  );

  // The hotkey is only bound while a vault is open. A locked Argus has no
  // credentials to type, and leaving the accelerator claimed would keep it
  // away from whatever else the user has bound it to.
  const autoType = useAutoType(
    autoTypeService,
    globalHotkey,
    { ...autoTypeSettings, enabled: autoTypeSettings.enabled && screen.kind === "unlocked" },
    autoTypeEntries,
  );

  useEffect(() => {
    if (screen.kind !== "unlocked") {
      return;
    }
    const autoLock = settings.autoLock ?? DEFAULT_AUTO_LOCK;
    const lock = handleLock(screen.filePath);
    const cleanups: (() => void)[] = [];

    if (autoLock.idleTimeoutMinutes !== undefined) {
      const timeoutMinutes = autoLock.idleTimeoutMinutes;
      let lastActivityAt = Date.now();
      const markActivity = () => {
        lastActivityAt = Date.now();
      };
      for (const eventName of ACTIVITY_EVENTS) {
        window.addEventListener(eventName, markActivity);
      }
      const intervalId = setInterval(() => {
        if (hasIdleTimedOut(lastActivityAt, Date.now(), timeoutMinutes)) {
          lock();
        }
      }, IDLE_CHECK_INTERVAL_MS);
      cleanups.push(() => {
        for (const eventName of ACTIVITY_EVENTS) {
          window.removeEventListener(eventName, markActivity);
        }
        clearInterval(intervalId);
      });
    }

    if (autoLock.lockOnSleep) {
      let lastTickAt = Date.now();
      const intervalId = setInterval(() => {
        const now = Date.now();
        if (
          hasClockJumped(lastTickAt, now, SLEEP_CHECK_INTERVAL_MS, SLEEP_CLOCK_JUMP_TOLERANCE_MS)
        ) {
          lock();
        }
        lastTickAt = now;
      }, SLEEP_CHECK_INTERVAL_MS);
      cleanups.push(() => clearInterval(intervalId));
    }

    if (autoLock.lockOnMinimize) {
      cleanups.push(windowEvents.onMinimize(lock));
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [screen, settings.autoLock, windowEvents]);

  useEffect(() => {
    void settingsStore
      .load()
      .then((loaded) => {
        setSettings(loaded);
        const mostRecent = loaded.recentVaults[0];
        if (mostRecent) {
          setScreen({ kind: "locked", filePath: mostRecent.path });
        }
      })
      .catch(() => {
        // Stay on the welcome screen with default settings if loading fails.
      });
  }, [settingsStore]);

  useEffect(() => {
    const hue = accentColorHue(settings.accentColor ?? DEFAULT_ACCENT_COLOR);
    const { accent, accentHover } = accentColorCssVars(hue);
    document.documentElement.style.setProperty("--color-accent", accent);
    document.documentElement.style.setProperty("--color-accent-hover", accentHover);
  }, [settings.accentColor]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme ?? DEFAULT_THEME;
  }, [settings.theme]);

  useEffect(() => {
    void windowProtection.setContentProtected(
      settings.contentProtection ?? DEFAULT_CONTENT_PROTECTION,
    );
  }, [settings.contentProtection, windowProtection]);

  async function refreshFileInfo(filePath: string) {
    try {
      setFileInfo(await vaultAccessService.getFileInfo(filePath));
    } catch {
      // Best-effort; the vault info panel just stays blank on failure.
    }
  }

  async function rememberAndUnlock(vault: Vault, filePath: string) {
    const updated = recordVaultOpened(settings, filePath);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Recency tracking is best-effort; don't block unlocking on it.
    }
    setScreen({ kind: "unlocked", vault, filePath });
    void refreshFileInfo(filePath);
  }

  function handleOpened(opened: OpenedVault) {
    void rememberAndUnlock(opened.vault, opened.filePath);
  }

  function handleUnlocked(filePath: string) {
    return (vault: Vault) => {
      void rememberAndUnlock(vault, filePath);
    };
  }

  function handleSelectRecent(filePath: string) {
    setScreen({ kind: "locked", filePath });
  }

  function handleChooseDifferentVault() {
    setScreen({ kind: "welcome" });
  }

  function handleLock(filePath: string) {
    return () => {
      setScreen({ kind: "locked", filePath });
    };
  }

  /**
   * A conflict opens the resolution modal *and* rejects. The screens awaiting
   * this treat it resolving as "the file was written" — they close the editor,
   * select the new entry, report the password as changed — so swallowing the
   * failure here would have them all confirm a save that never happened.
   */
  function handleVaultSave(filePath: string) {
    return async (nextVault: Vault) => {
      try {
        await vaultAccessService.saveVault(nextVault, filePath);
      } catch (cause) {
        if (cause instanceof VaultSaveConflictError) {
          setConflict({ nextVault, filePath });
        }
        throw cause;
      }
      setScreen({ kind: "unlocked", vault: nextVault, filePath });
      void refreshFileInfo(filePath);
    };
  }

  // The vault changed in a way that doesn't warrant writing the file — today
  // only the "entry was opened" stamp, which rides along with the next real
  // save instead of re-encrypting the whole vault on every click.
  function handleVaultChange(filePath: string) {
    return (nextVault: Vault) => {
      setScreen({ kind: "unlocked", vault: nextVault, filePath });
    };
  }

  function handleChangeMasterPassword(vault: Vault, filePath: string) {
    return async (currentPassword: string, newPassword: string) => {
      try {
        await vaultAccessService.changeMasterPassword(
          vault,
          filePath,
          currentPassword,
          newPassword,
        );
      } catch (cause) {
        if (cause instanceof VaultSaveConflictError) {
          setConflict({ nextVault: vault, filePath });
        }
        throw cause;
      }
      void refreshFileInfo(filePath);
    };
  }

  async function handleOverwriteConflict(pending: SaveConflict) {
    await vaultAccessService.saveVault(pending.nextVault, pending.filePath, { force: true });
    setScreen({ kind: "unlocked", vault: pending.nextVault, filePath: pending.filePath });
    setConflict(undefined);
    void refreshFileInfo(pending.filePath);
  }

  function handleDiscardConflict(pending: SaveConflict) {
    setConflict(undefined);
    handleLock(pending.filePath)();
  }

  async function handleGeneratorPolicyChange(policy: PasswordPolicyOptions) {
    const updated = withGeneratorPolicy(settings, policy);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a generator settings save failure shouldn't interrupt the UI.
    }
  }

  async function handleClipboardClearSecondsChange(seconds: number) {
    const updated = withClipboardClearSeconds(settings, seconds);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  async function handleAutoLockChange(autoLock: AutoLockSettings) {
    const updated = withAutoLock(settings, autoLock);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  async function handleAutoTypeChange(autoTypeNext: AutoTypeSettings) {
    const updated = withAutoType(settings, autoTypeNext);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  async function handleGroupDeleteModeChange(mode: GroupDeleteMode) {
    const updated = withGroupDeleteMode(settings, mode);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  async function handleAccentColorChange(accentColor: AccentColor) {
    const updated = withAccentColor(settings, accentColor);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  async function handleThemeChange(theme: Theme) {
    const updated = withTheme(settings, theme);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  async function handleContentProtectionChange(contentProtection: boolean) {
    const updated = withContentProtection(settings, contentProtection);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  async function handleEntrySortChange(sort: EntrySortId) {
    const updated = withEntrySort(settings, sort);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  async function handleEntryFieldVisibilityChange(visibility: EntryFieldVisibility) {
    const updated = withEntryFieldVisibility(settings, visibility);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Best-effort; a settings save failure shouldn't interrupt the UI.
    }
  }

  function handleExportSettings(): Promise<string | undefined> {
    return settingsTransferService.exportSettings(settings);
  }

  /**
   * Persists the imported settings before applying them, so a failed write
   * surfaces as an error on the settings screen instead of leaving the app
   * showing settings that would be gone again on the next launch.
   */
  async function handleImportSettings(): Promise<string | undefined> {
    const imported = await settingsTransferService.importSettings(settings);
    if (!imported) {
      return undefined;
    }
    await settingsStore.save(imported.settings);
    setSettings(imported.settings);
    return imported.filePath;
  }

  if (screen.kind === "welcome") {
    return (
      <WelcomeScreen
        recentVaults={settings.recentVaults}
        vaultAccessService={vaultAccessService}
        onOpened={handleOpened}
        onSelectRecent={handleSelectRecent}
      />
    );
  }

  if (screen.kind === "locked") {
    return (
      <LockedScreen
        filePath={screen.filePath}
        vaultAccessService={vaultAccessService}
        onUnlocked={handleUnlocked(screen.filePath)}
        onChooseDifferentVault={handleChooseDifferentVault}
      />
    );
  }

  return (
    <>
      <VaultShell
        vault={screen.vault}
        filePath={screen.filePath}
        fileInfo={fileInfo}
        urlOpener={urlOpener}
        clipboardWriter={clipboardWriter}
        generatorPolicy={settings.generatorPolicy ?? {}}
        clipboardClearSeconds={settings.clipboardClearSeconds ?? DEFAULT_CLIPBOARD_CLEAR_SECONDS}
        autoLock={settings.autoLock ?? DEFAULT_AUTO_LOCK}
        autoType={autoTypeSettings}
        groupDeleteMode={settings.groupDeleteMode ?? DEFAULT_GROUP_DELETE_MODE}
        accentColor={settings.accentColor ?? DEFAULT_ACCENT_COLOR}
        theme={settings.theme ?? DEFAULT_THEME}
        contentProtection={settings.contentProtection ?? DEFAULT_CONTENT_PROTECTION}
        entryFieldVisibility={settings.entryFieldVisibility ?? DEFAULT_ENTRY_FIELD_VISIBILITY}
        entrySort={settings.entrySort ?? DEFAULT_ENTRY_SORT}
        mergeSource={mergeSource}
        onLock={handleLock(screen.filePath)}
        onSave={handleVaultSave(screen.filePath)}
        onVaultChange={handleVaultChange(screen.filePath)}
        onChangeMasterPassword={handleChangeMasterPassword(screen.vault, screen.filePath)}
        onGeneratorPolicyChange={(policy) => void handleGeneratorPolicyChange(policy)}
        onClipboardClearSecondsChange={(seconds) => void handleClipboardClearSecondsChange(seconds)}
        onAutoLockChange={(autoLock) => void handleAutoLockChange(autoLock)}
        onAutoTypeChange={(next) => void handleAutoTypeChange(next)}
        onGroupDeleteModeChange={(mode) => void handleGroupDeleteModeChange(mode)}
        onAccentColorChange={(accentColor) => void handleAccentColorChange(accentColor)}
        onThemeChange={(theme) => void handleThemeChange(theme)}
        onEntrySortChange={(sort) => void handleEntrySortChange(sort)}
        onContentProtectionChange={(contentProtection) =>
          void handleContentProtectionChange(contentProtection)
        }
        onEntryFieldVisibilityChange={(visibility) =>
          void handleEntryFieldVisibilityChange(visibility)
        }
        onExportSettings={handleExportSettings}
        onImportSettings={handleImportSettings}
      />
      {autoType.request && (
        <AutoTypePicker
          request={autoType.request}
          onTypeInto={autoType.typeInto}
          onCancel={autoType.dismiss}
        />
      )}
      {autoType.error && (
        <div className="auto-type-toast" role="alert">
          <span>{autoType.error}</span>
          <button
            type="button"
            className="auto-type-toast-dismiss"
            aria-label="Dismiss auto-type error"
            onClick={autoType.dismissError}
          >
            &times;
          </button>
        </div>
      )}
      {conflict && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Vault changed on disk</h2>
            <p>
              This vault file was modified outside Argus since it was last opened or saved here.
              Overwriting will discard that external change.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDiscardConflict(conflict)}
              >
                Discard my changes &amp; lock
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleOverwriteConflict(conflict)}
              >
                Overwrite anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
