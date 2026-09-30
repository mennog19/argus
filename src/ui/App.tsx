import { useEffect, useMemo, useState } from "react";
import { Vault } from "../domain";
import { ClipboardWriter } from "../application/clipboard";
import {
  MasterPasswordChangeResult,
  OpenedVault,
  VaultAccessService,
  VaultFileInfo,
  VaultSaveConflictError,
} from "../application/vault-access-service";
import { GlobalHotkey } from "../application/auto-type";
import { AutoTypeService } from "../application/auto-type-service";
import { WindowEvents } from "../application/window-events";
import { WindowProtection } from "../application/window-protection";
import { WindowCloseBehavior } from "../application/window-close-behavior";
import { SettingsStore } from "../application/settings";
import { SettingsTransferService } from "../application/settings-transfer-service";
import { UrlOpener } from "../application/url-opener";
import { VaultMergeSource } from "../application/vault-merge-source";
import { VaultOpenRequests } from "../application/vault-open-requests";
import { collectAllEntries, fieldReferencesOf } from "./vault-browsing";
import { useAppSettings } from "./use-app-settings";
import { useAutoLock } from "./use-auto-lock";
import { useAutoType } from "./use-auto-type";
import { useExpiredEntries } from "./use-expired-entries";
import { useVaultOpenRequests } from "./use-vault-open-requests";
import { useWindowAppearance } from "./use-window-appearance";
import { AutoTypeErrorToast } from "./screens/AutoTypeErrorToast";
import { CustomIconsContext } from "./entry-icons/custom-icons-context";
import { AutoTypePicker } from "./screens/AutoTypePicker";
import { LockedScreen } from "./screens/LockedScreen";
import { SaveConflictDialog } from "./screens/SaveConflictDialog";
import { VaultShell } from "./screens/VaultShell";
import { WelcomeScreen } from "./screens/WelcomeScreen";
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
  windowCloseBehavior: WindowCloseBehavior;
  mergeSource: VaultMergeSource;
  autoTypeService: AutoTypeService;
  globalHotkey: GlobalHotkey;
  vaultOpenRequests: VaultOpenRequests;
}

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
  windowCloseBehavior,
  mergeSource,
  autoTypeService,
  globalHotkey,
  vaultOpenRequests,
}: AppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: "welcome" });
  const [conflict, setConflict] = useState<SaveConflict | undefined>(undefined);
  const [fileInfo, setFileInfo] = useState<VaultFileInfo | undefined>(undefined);

  const appSettings = useAppSettings(settingsStore, settingsTransferService, (loaded) => {
    const mostRecent = loaded.recentVaults[0];
    if (mostRecent) {
      // Unless a vault Argus was launched to open got here first.
      setScreen((current) =>
        current.kind === "welcome" ? { kind: "locked", filePath: mostRecent.path } : current,
      );
    }
  });
  const { settings, effective } = appSettings;

  useWindowAppearance(effective, windowProtection);

  useEffect(() => {
    void windowCloseBehavior.setCloseToTray(effective.closeToTray);
  }, [effective.closeToTray, windowCloseBehavior]);

  useAutoLock(
    screen.kind === "unlocked" ? screen : undefined,
    effective.autoLock,
    windowEvents,
    (unlocked) => lock(unlocked.filePath),
  );

  useExpiredEntries(
    screen.kind === "unlocked" ? screen : undefined,
    effective.expiredEntryAction,
    (nextVault, unlocked) => saveVault(nextVault, unlocked.filePath),
  );

  // A vault opened from Explorer replaces whatever is open: that one is
  // locked, and the new one asks for its own master password. Asking for the
  // vault that's already unlocked just leaves it be.
  useVaultOpenRequests(vaultOpenRequests, (filePath) => {
    if (screen.kind === "unlocked" && screen.filePath === filePath) {
      return;
    }
    setConflict(undefined);
    lock(filePath);
  });

  // Everything auto-type is allowed to offer: the whole vault minus the
  // recycle bin, so a deleted login can't be typed back into a live site.
  // References are resolved up front: what gets matched and typed is the
  // linked entry's real username and password, never the `{REF:…}` text.
  const autoTypeEntries = useMemo(() => {
    if (screen.kind !== "unlocked") {
      return [];
    }
    const { rootGroup, recycleBin } = screen.vault;
    const references = fieldReferencesOf(rootGroup);
    return collectAllEntries(rootGroup, recycleBin ? [recycleBin.id] : []).map(({ entry }) =>
      references.resolveEntry(entry),
    );
  }, [screen]);

  // The hotkey is only bound while a vault is open. A locked Argus has no
  // credentials to type, and leaving the accelerator claimed would keep it
  // away from whatever else the user has bound it to.
  const autoType = useAutoType(
    autoTypeService,
    globalHotkey,
    { ...effective.autoType, enabled: effective.autoType.enabled && screen.kind === "unlocked" },
    autoTypeEntries,
  );

  function lock(filePath: string) {
    vaultAccessService.closeVault();
    setScreen({ kind: "locked", filePath });
  }

  async function refreshFileInfo(filePath: string) {
    try {
      setFileInfo(await vaultAccessService.getFileInfo(filePath));
    } catch {
      // Best-effort; the vault info panel just stays blank on failure.
    }
  }

  async function rememberAndUnlock(vault: Vault, filePath: string, keyFilePath?: string) {
    await appSettings.recordVaultOpened({ path: filePath, keyFilePath });
    setScreen({ kind: "unlocked", vault, filePath });
    void refreshFileInfo(filePath);
  }

  /**
   * A conflict opens the resolution modal *and* rejects. The screens awaiting
   * a save treat it resolving as "the file was written" — they close the
   * editor, select the new entry, report the password as changed — so
   * swallowing the failure here would have them all confirm a save that never
   * happened.
   */
  async function writeReportingConflicts(pending: SaveConflict, write: () => Promise<void>) {
    try {
      await write();
    } catch (cause) {
      if (cause instanceof VaultSaveConflictError) {
        setConflict(pending);
      }
      throw cause;
    }
  }

  async function saveVault(nextVault: Vault, filePath: string) {
    let saved: Vault | undefined;
    await writeReportingConflicts({ nextVault, filePath }, async () => {
      saved = await vaultAccessService.saveVault(nextVault, filePath);
    });
    // The vault as saved, so e.g. the history revision an edit pushed shows
    // up. `writeReportingConflicts` only resolves once the write above has.
    setScreen({ kind: "unlocked", vault: saved!, filePath });
    void refreshFileInfo(filePath);
  }

  async function changeMasterPassword(
    vault: Vault,
    filePath: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<MasterPasswordChangeResult> {
    let result: MasterPasswordChangeResult | undefined;
    await writeReportingConflicts({ nextVault: vault, filePath }, async () => {
      result = await vaultAccessService.changeMasterPassword(
        vault,
        filePath,
        currentPassword,
        newPassword,
      );
    });
    void refreshFileInfo(filePath);
    // `writeReportingConflicts` only resolves once the write above has.
    return result!;
  }

  async function upgradeVaultFormat(vault: Vault, filePath: string) {
    let saved: Vault | undefined;
    await writeReportingConflicts({ nextVault: vault, filePath }, async () => {
      saved = await vaultAccessService.upgradeVaultFormat(vault, filePath);
    });
    // `writeReportingConflicts` only resolves once the write above has.
    setScreen({ kind: "unlocked", vault: saved!, filePath });
    // Also what tells the settings screen the vault is now KDBX 4.
    void refreshFileInfo(filePath);
  }

  async function overwriteConflict(pending: SaveConflict) {
    const saved = await vaultAccessService.saveVault(pending.nextVault, pending.filePath, {
      force: true,
    });
    setScreen({ kind: "unlocked", vault: saved, filePath: pending.filePath });
    setConflict(undefined);
    void refreshFileInfo(pending.filePath);
  }

  function discardConflict(pending: SaveConflict) {
    setConflict(undefined);
    lock(pending.filePath);
  }

  if (screen.kind === "welcome") {
    return (
      <WelcomeScreen
        recentVaults={settings.recentVaults}
        vaultAccessService={vaultAccessService}
        onOpened={(opened: OpenedVault) =>
          void rememberAndUnlock(opened.vault, opened.filePath, opened.keyFilePath)
        }
        onSelectRecent={lock}
      />
    );
  }

  if (screen.kind === "locked") {
    const { filePath } = screen;
    return (
      <LockedScreen
        // Remounting per vault resets the key file picked for the previous one.
        key={filePath}
        filePath={filePath}
        initialKeyFilePath={
          settings.recentVaults.find((entry) => entry.path === filePath)?.keyFilePath
        }
        vaultAccessService={vaultAccessService}
        onUnlocked={(vault, keyFilePath) => void rememberAndUnlock(vault, filePath, keyFilePath)}
        onChooseDifferentVault={() => setScreen({ kind: "welcome" })}
      />
    );
  }

  const { vault, filePath } = screen;
  return (
    <>
      <VaultShell
        vault={vault}
        filePath={filePath}
        fileInfo={fileInfo}
        urlOpener={urlOpener}
        clipboardWriter={clipboardWriter}
        mergeSource={mergeSource}
        settings={effective}
        onSettingChange={appSettings.changeSetting}
        onLock={() => lock(filePath)}
        onSave={(nextVault) => saveVault(nextVault, filePath)}
        // The vault changed in a way that doesn't warrant writing the file —
        // today only the "entry was opened" stamp, which rides along with the
        // next real save instead of re-encrypting the whole vault per click.
        onVaultChange={(nextVault) => setScreen({ kind: "unlocked", vault: nextVault, filePath })}
        onChangeMasterPassword={(currentPassword, newPassword) =>
          changeMasterPassword(vault, filePath, currentPassword, newPassword)
        }
        onUpgradeFormat={() => upgradeVaultFormat(vault, filePath)}
        onExportSettings={appSettings.exportSettings}
        onImportSettings={appSettings.importSettings}
      />
      {autoType.request && (
        <CustomIconsContext value={{ icons: vault.customIcons }}>
          <AutoTypePicker
            request={autoType.request}
            onTypeInto={autoType.typeInto}
            onCancel={autoType.dismiss}
          />
        </CustomIconsContext>
      )}
      {autoType.error && (
        <AutoTypeErrorToast message={autoType.error} onDismiss={autoType.dismissError} />
      )}
      {conflict && (
        <SaveConflictDialog
          onDiscard={() => discardConflict(conflict)}
          onOverwrite={() => void overwriteConflict(conflict)}
        />
      )}
    </>
  );
}

export default App;
