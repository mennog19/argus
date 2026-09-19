import { useEffect, useState } from "react";
import { Vault } from "../domain";
import { OpenedVault, VaultAccessService } from "../application/vault-access-service";
import { AppSettings, DEFAULT_SETTINGS, recordVaultOpened, SettingsStore } from "../application/settings";
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

function App({ vaultAccessService, settingsStore, urlOpener }: AppProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>({ kind: "welcome" });

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

  return <VaultShell vault={screen.vault} urlOpener={urlOpener} onLock={handleLock(screen.filePath)} />;
}

export default App;
