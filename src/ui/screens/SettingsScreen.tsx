import { Fragment, ReactNode, useState } from "react";
import { EffectiveSettings } from "../../application/settings";
import { SHORTCUT_LABELS } from "../../application/shortcuts";
import { SettingsImportResult } from "../../application/settings-transfer-service";
import { VaultFileInfo } from "../../application/vault-access-service";
import { SettingsTransferCard } from "./SettingsTransferCard";
import { AppearanceSection } from "./settings/AppearanceSection";
import { AutoTypeSection } from "./settings/AutoTypeSection";
import { DangerZoneSection, VaultFileActions } from "./settings/DangerZoneSection";
import { EntryCreationSection } from "./settings/EntryCreationSection";
import { ExpiredEntriesSection } from "./settings/ExpiredEntriesSection";
import { GroupsSection } from "./settings/GroupsSection";
import { SecuritySection } from "./settings/SecuritySection";
import { ShortcutsSection } from "./settings/ShortcutsSection";
import { SettingChangeHandler } from "../setting-change";
import { UpdatesSection } from "./settings/UpdatesSection";
import { VaultInfoSection } from "./settings/VaultInfoSection";
import { WindowSection } from "./settings/WindowSection";
import { SearchIcon } from "../icons";

interface SettingsSection {
  id: string;
  /**
   * What a search is matched against: the section's heading and the wording
   * of the settings in it, plus other words someone might look for them by.
   */
  searchText: string;
  render: () => ReactNode;
}

interface SettingsScreenProps {
  filePath: string;
  vaultName: string;
  fileInfo: VaultFileInfo | undefined;
  entryCount: number;
  settings: EffectiveSettings;
  onSettingChange: SettingChangeHandler;
  vaultFileActions: VaultFileActions;
  /** Why the last merge attempt never got started, e.g. the picked file is this vault. */
  mergeError: string | undefined;
  onOpenMergeWizard: () => void;
  onExportSettings: () => Promise<string | undefined>;
  onImportSettings: () => Promise<SettingsImportResult | undefined>;
}

export function SettingsScreen({
  filePath,
  vaultName,
  fileInfo,
  entryCount,
  settings,
  onSettingChange,
  vaultFileActions,
  mergeError,
  onOpenMergeWizard,
  onExportSettings,
  onImportSettings,
}: SettingsScreenProps) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();

  const sections: SettingsSection[] = [
    {
      id: "vault",
      searchText: "Vault file name passwords entries count size format kdbx last saved",
      render: () => (
        <VaultInfoSection filePath={filePath} fileInfo={fileInfo} entryCount={entryCount} />
      ),
    },
    {
      id: "appearance",
      searchText: "Appearance theme dark light system accent color colour custom",
      render: () => (
        <AppearanceSection
          theme={settings.theme}
          accentColor={settings.accentColor}
          onSettingChange={onSettingChange}
        />
      ),
    },
    {
      id: "window",
      searchText: "Window minimize to the system tray when the window is closed close",
      render: () => (
        <WindowSection closeToTray={settings.closeToTray} onSettingChange={onSettingChange} />
      ),
    },
    {
      id: "updates",
      searchText: "Updates version check for updates when Argus starts release",
      render: () => (
        <UpdatesSection
          checkForUpdates={settings.checkForUpdates}
          onSettingChange={onSettingChange}
        />
      ),
    },
    {
      id: "security",
      searchText:
        "Security auto-lock lock after inactivity idle timeout minutes clear clipboard seconds " +
        "minimized sleeps computer is locked hide window screen sharing recording",
      render: () => (
        <SecuritySection
          autoLock={settings.autoLock}
          clipboardClearSeconds={settings.clipboardClearSeconds}
          contentProtection={settings.contentProtection}
          onSettingChange={onSettingChange}
        />
      ),
    },
    {
      id: "auto-type",
      searchText: "Auto-type autotype type credentials into other apps with a hotkey",
      render: () => (
        <AutoTypeSection autoType={settings.autoType} onSettingChange={onSettingChange} />
      ),
    },
    {
      id: "shortcuts",
      searchText: `Keyboard shortcuts hotkeys ${Object.values(SHORTCUT_LABELS).join(" ")}`,
      render: () => (
        <ShortcutsSection
          shortcuts={settings.shortcuts}
          autoTypeHotkey={settings.autoType.enabled ? settings.autoType.hotkey : undefined}
          onSettingChange={onSettingChange}
        />
      ),
    },
    {
      id: "groups",
      searchText: "Groups folders when deleting a group delete keep entries subgroups",
      render: () => (
        <GroupsSection
          groupDeleteMode={settings.groupDeleteMode}
          onSettingChange={onSettingChange}
        />
      ),
    },
    {
      id: "entry-creation",
      searchText:
        "Entry creation new entry form fields username password authenticator totp url notes " +
        "group tags expiry date",
      render: () => (
        <EntryCreationSection
          entryFieldVisibility={settings.entryFieldVisibility}
          onSettingChange={onSettingChange}
        />
      ),
    },
    {
      id: "expired-entries",
      searchText: "Expired entries when an entry expires expiry",
      render: () => (
        <ExpiredEntriesSection
          expiredEntryAction={settings.expiredEntryAction}
          onSettingChange={onSettingChange}
        />
      ),
    },
    {
      id: "settings-file",
      searchText: "Settings file export import backup transfer",
      render: () => (
        <section className="detail-section">
          <div className="detail-section-label">Settings file</div>
          <SettingsTransferCard
            onExportSettings={onExportSettings}
            onImportSettings={onImportSettings}
          />
        </section>
      ),
    },
    {
      id: "danger-zone",
      searchText:
        "Danger zone merge another vault change master password key file vault settings name " +
        "history key derivation kdf argon2 upgrade file format kdbx",
      render: () => (
        <DangerZoneSection
          mergeError={mergeError}
          onOpenMergeWizard={onOpenMergeWizard}
          vaultName={vaultName}
          fileInfo={fileInfo}
          actions={vaultFileActions}
        />
      ),
    },
  ];

  // Every word typed has to turn up somewhere in the section, in any order.
  const words = trimmedQuery.toLowerCase().split(/\s+/);
  const visibleSections = sections.filter((section) => {
    const searchText = section.searchText.toLowerCase();
    return words.every((word) => searchText.includes(word));
  });

  return (
    <div className="detail-pane">
      <div className="detail-content">
        <div className="settings-header">
          <h1 className="detail-title">Settings</h1>
          <div className="entry-search settings-search">
            <SearchIcon size={14} />
            <input
              type="text"
              className="entry-search-input"
              placeholder="Search settings…"
              aria-label="Search settings"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("");
                }
              }}
            />
          </div>
        </div>

        <div className="detail-cards">
          {visibleSections.map((section) => (
            <Fragment key={section.id}>{section.render()}</Fragment>
          ))}
          {visibleSections.length === 0 && (
            <div className="detail-card padded">No settings match "{trimmedQuery}".</div>
          )}
        </div>
      </div>
    </div>
  );
}
