import React from "react";
import ReactDOM from "react-dom/client";
import App from "./ui/App";
import { AttachmentExportService } from "./application/attachment-export-service";
import { VaultAccessService } from "./application/vault-access-service";
import { KdbxVaultMergeSource } from "./infrastructure/kdbx-vault-merge-source";
import { KdbxVaultRepository } from "./infrastructure/kdbx-vault-repository";
import { TauriAttachmentFileDialog } from "./infrastructure/tauri-attachment-file-dialog";
import { TauriFileStorage } from "./infrastructure/tauri-file-storage";
import { TauriVaultFileDialog } from "./infrastructure/tauri-vault-file-dialog";
import { TauriSettingsFileDialog } from "./infrastructure/tauri-settings-file-dialog";
import { SettingsTransferService } from "./application/settings-transfer-service";
import { JsonSettingsStore } from "./infrastructure/json-settings-store";
import { TauriUrlOpener } from "./infrastructure/tauri-url-opener";
import { TauriClipboard } from "./infrastructure/tauri-clipboard";
import { TauriAutoTyper } from "./infrastructure/tauri-auto-typer";
import { TauriGlobalHotkey } from "./infrastructure/tauri-global-hotkey";
import { AutoTypeService } from "./application/auto-type-service";
import { TauriWindowEvents } from "./infrastructure/tauri-window-events";
import { TauriWindowProtection } from "./infrastructure/tauri-window-protection";
import { TauriWindowCloseBehavior } from "./infrastructure/tauri-window-close-behavior";
import { TauriVaultOpenRequests } from "./infrastructure/tauri-vault-open-requests";
import { TauriUpdater } from "./infrastructure/tauri-updater";

const vaultFileDialog = new TauriVaultFileDialog();
const fileStorage = new TauriFileStorage();
const vaultAccessService = new VaultAccessService(
  new KdbxVaultRepository(),
  vaultFileDialog,
  fileStorage,
);
const mergeSource = new KdbxVaultMergeSource(vaultFileDialog, fileStorage);
const settingsStore = new JsonSettingsStore();
const settingsTransferService = new SettingsTransferService(
  new TauriSettingsFileDialog(),
  fileStorage,
);
const attachmentExportService = new AttachmentExportService(
  new TauriAttachmentFileDialog(),
  fileStorage,
);
const urlOpener = new TauriUrlOpener();
const clipboardWriter = new TauriClipboard();
const windowEvents = new TauriWindowEvents();
const windowProtection = new TauriWindowProtection();
const windowCloseBehavior = new TauriWindowCloseBehavior();
const autoTypeService = new AutoTypeService(new TauriAutoTyper());
const globalHotkey = new TauriGlobalHotkey();
const vaultOpenRequests = new TauriVaultOpenRequests();
const updater = new TauriUpdater();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App
      vaultAccessService={vaultAccessService}
      settingsStore={settingsStore}
      settingsTransferService={settingsTransferService}
      attachmentExportService={attachmentExportService}
      urlOpener={urlOpener}
      clipboardWriter={clipboardWriter}
      windowEvents={windowEvents}
      windowProtection={windowProtection}
      windowCloseBehavior={windowCloseBehavior}
      mergeSource={mergeSource}
      autoTypeService={autoTypeService}
      globalHotkey={globalHotkey}
      vaultOpenRequests={vaultOpenRequests}
      updater={updater}
    />
  </React.StrictMode>,
);
