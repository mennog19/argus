import { EffectiveSettings } from "../../application/settings";
import { SettingsImportResult } from "../../application/settings-transfer-service";
import { MasterPasswordChangeResult, VaultFileInfo } from "../../application/vault-access-service";
import { SettingsTransferCard } from "./SettingsTransferCard";
import { AppearanceSection } from "./settings/AppearanceSection";
import { AutoTypeSection } from "./settings/AutoTypeSection";
import { DangerZoneSection } from "./settings/DangerZoneSection";
import { EntryCreationSection } from "./settings/EntryCreationSection";
import { ExpiredEntriesSection } from "./settings/ExpiredEntriesSection";
import { GroupsSection } from "./settings/GroupsSection";
import { SecuritySection } from "./settings/SecuritySection";
import { SettingChangeHandler } from "../setting-change";
import { VaultInfoSection } from "./settings/VaultInfoSection";

interface SettingsScreenProps {
  filePath: string;
  fileInfo: VaultFileInfo | undefined;
  entryCount: number;
  settings: EffectiveSettings;
  onSettingChange: SettingChangeHandler;
  onChangeMasterPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<MasterPasswordChangeResult>;
  /** Why the last merge attempt never got started, e.g. the picked file is this vault. */
  mergeError: string | undefined;
  onOpenMergeWizard: () => void;
  onExportSettings: () => Promise<string | undefined>;
  onImportSettings: () => Promise<SettingsImportResult | undefined>;
}

export function SettingsScreen({
  filePath,
  fileInfo,
  entryCount,
  settings,
  onSettingChange,
  onChangeMasterPassword,
  mergeError,
  onOpenMergeWizard,
  onExportSettings,
  onImportSettings,
}: SettingsScreenProps) {
  return (
    <div className="detail-pane">
      <div className="detail-content">
        <h1 className="detail-title">Settings</h1>

        <div className="detail-cards">
          <VaultInfoSection filePath={filePath} fileInfo={fileInfo} entryCount={entryCount} />
          <AppearanceSection
            theme={settings.theme}
            accentColor={settings.accentColor}
            onSettingChange={onSettingChange}
          />
          <SecuritySection
            autoLock={settings.autoLock}
            clipboardClearSeconds={settings.clipboardClearSeconds}
            contentProtection={settings.contentProtection}
            onSettingChange={onSettingChange}
          />
          <AutoTypeSection autoType={settings.autoType} onSettingChange={onSettingChange} />
          <GroupsSection
            groupDeleteMode={settings.groupDeleteMode}
            onSettingChange={onSettingChange}
          />
          <EntryCreationSection
            entryFieldVisibility={settings.entryFieldVisibility}
            onSettingChange={onSettingChange}
          />
          <ExpiredEntriesSection
            expiredEntryAction={settings.expiredEntryAction}
            onSettingChange={onSettingChange}
          />
          <section className="detail-section">
            <div className="detail-section-label">Settings file</div>
            <SettingsTransferCard
              onExportSettings={onExportSettings}
              onImportSettings={onImportSettings}
            />
          </section>
          <DangerZoneSection
            mergeError={mergeError}
            onOpenMergeWizard={onOpenMergeWizard}
            onChangeMasterPassword={onChangeMasterPassword}
          />
        </div>
      </div>
    </div>
  );
}
