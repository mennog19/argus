import React from "react";
import ReactDOM from "react-dom/client";
import App from "./ui/App";
import { VaultAccessService } from "./application/vault-access-service";
import { KdbxVaultRepository } from "./infrastructure/kdbx-vault-repository";
import { TauriFileStorage } from "./infrastructure/tauri-file-storage";
import { TauriVaultFileDialog } from "./infrastructure/tauri-vault-file-dialog";
import { JsonSettingsStore } from "./infrastructure/json-settings-store";
import { TauriUrlOpener } from "./infrastructure/tauri-url-opener";
import { TauriClipboard } from "./infrastructure/tauri-clipboard";
import { TauriWindowEvents } from "./infrastructure/tauri-window-events";
import { TauriWindowProtection } from "./infrastructure/tauri-window-protection";

const vaultAccessService = new VaultAccessService(
  new KdbxVaultRepository(),
  new TauriVaultFileDialog(),
  new TauriFileStorage(),
);
const settingsStore = new JsonSettingsStore();
const urlOpener = new TauriUrlOpener();
const clipboardWriter = new TauriClipboard();
const windowEvents = new TauriWindowEvents();
const windowProtection = new TauriWindowProtection();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App
      vaultAccessService={vaultAccessService}
      settingsStore={settingsStore}
      urlOpener={urlOpener}
      clipboardWriter={clipboardWriter}
      windowEvents={windowEvents}
      windowProtection={windowProtection}
    />
  </React.StrictMode>,
);
