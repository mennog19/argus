import { useEffect, useState } from "react";
import { PasswordPolicyOptions, Vault } from "../domain";
import { OpenedVault, VaultAccessService, VaultSaveConflictError } from "../application/vault-access-service";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  recordVaultOpened,
  SettingsStore,
  withGeneratorPolicy,
} from "../application/settings";
import { UrlOpener } from "../application/url-opener";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { LockedScreen } from "./screens/LockedScreen";
import { VaultShell } from "./screens/VaultShell";
import "./styles/theme.css";
import "./styles/shell.css";

interface AppProps {
  vaultAccessService: VaultAccessService;
  settingsStore: SettingsStore;
  urlOpener: UrlOpener;
}

type Screen =
  | { kind: "welcome" }
  | { kind: "locked"; filePath: string }
  | { kind: "unlocked"; vault: Vault; filePath: string };

interface SaveConflict {
  nextVault: Vault;
  filePath: string;
}

function App({ vaultAccessService, settingsStore, urlOpener }: AppProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>({ kind: "welcome" });
  const [conflict, setConflict] = useState<SaveConflict | undefined>(undefined);

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

  async function rememberAndUnlock(vault: Vault, filePath: string) {
    const updated = recordVaultOpened(settings, filePath);
    setSettings(updated);
    try {
      await settingsStore.save(updated);
    } catch {
      // Recency tracking is best-effort; don't block unlocking on it.
    }
    setScreen({ kind: "unlocked", vault, filePath });
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

  function handleVaultSave(filePath: string) {
    return async (nextVault: Vault) => {
      try {
        await vaultAccessService.saveVault(nextVault, filePath);
        setScreen({ kind: "unlocked", vault: nextVault, filePath });
      } catch (cause) {
        if (cause instanceof VaultSaveConflictError) {
          setConflict({ nextVault, filePath });
          return;
        }
        throw cause;
      }
    };
  }

  // Only rendered from within `{conflict && (...)}` below, so `conflict` is
  // always set by the time either handler can be invoked.
  async function handleOverwriteConflict() {
    const { nextVault, filePath } = conflict!;
    await vaultAccessService.saveVault(nextVault, filePath, { force: true });
    setScreen({ kind: "unlocked", vault: nextVault, filePath });
    setConflict(undefined);
  }

  function handleDiscardConflict() {
    const filePath = conflict!.filePath;
    setConflict(undefined);
    handleLock(filePath)();
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
        urlOpener={urlOpener}
        generatorPolicy={settings.generatorPolicy ?? {}}
        onLock={handleLock(screen.filePath)}
        onSave={handleVaultSave(screen.filePath)}
        onGeneratorPolicyChange={(policy) => void handleGeneratorPolicyChange(policy)}
        getPasswordChangedTimes={() => vaultAccessService.getPasswordChangedTimes()}
      />
      {conflict && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Vault changed on disk</h2>
            <p>
              This vault file was modified outside Argus since it was last opened or saved here.
              Overwriting will discard that external change.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={handleDiscardConflict}>
                Discard my changes &amp; lock
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleOverwriteConflict()}>
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
