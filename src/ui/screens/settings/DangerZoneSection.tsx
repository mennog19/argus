import {
  KeyFileChange,
  KeyFileChangeResult,
  MasterPasswordChangeResult,
  VaultFileInfo,
} from "../../../application/vault-access-service";
import { VaultSettings } from "../../../application/vault-settings";
import { ChangeKeyFileCard } from "../ChangeKeyFileCard";
import { ChangeMasterPasswordCard } from "../ChangeMasterPasswordCard";
import { UpgradeFormatCard } from "./UpgradeFormatCard";
import { VaultSettingsCard } from "./VaultSettingsCard";

/** The changes to the vault file itself that the danger zone offers. */
export interface VaultFileActions {
  onChangeMasterPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<MasterPasswordChangeResult>;
  onChangeKeyFile: (currentPassword: string, change: KeyFileChange) => Promise<KeyFileChangeResult>;
  /** An existing file to use as the key file; `undefined` when the user cancels. */
  onPickKeyFile: () => Promise<string | undefined>;
  /** Where to save a generated key file; `undefined` when the user cancels. */
  onPickNewKeyFilePath: () => Promise<string | undefined>;
  onChangeVaultSettings: (name: string, settings: VaultSettings) => Promise<void>;
  onUpgradeFormat: () => Promise<void>;
}

interface DangerZoneSectionProps {
  /** Why the last merge attempt never got started, e.g. the picked file is this vault. */
  mergeError: string | undefined;
  onOpenMergeWizard: () => void;
  vaultName: string;
  /** What the open vault's file says about itself, once known. */
  fileInfo: VaultFileInfo | undefined;
  actions: VaultFileActions;
}

export function DangerZoneSection({
  mergeError,
  onOpenMergeWizard,
  vaultName,
  fileInfo,
  actions,
}: DangerZoneSectionProps) {
  return (
    <section className="detail-section danger-zone">
      <div className="detail-section-label danger-zone-label">Danger zone</div>
      <p className="danger-zone-lead">
        These change the vault itself. Each is applied straight to the file on disk — make sure you
        have a backup first.
      </p>

      <div className="danger-zone-rows">
        <div className="danger-zone-row">
          <div className="danger-zone-row-text">
            <span className="danger-zone-row-title">Merge another vault</span>
            <span className="danger-zone-row-hint">
              Compare a second .kdbx file against this one and choose what to bring over.
            </span>
            {mergeError && <span className="field-error">{mergeError}</span>}
          </div>
          <button type="button" className="btn-danger-outline" onClick={onOpenMergeWizard}>
            Merge another vault in…
          </button>
        </div>

        <ChangeMasterPasswordCard onChangeMasterPassword={actions.onChangeMasterPassword} />

        {fileInfo && (
          <ChangeKeyFileCard
            hasKeyFile={fileInfo.hasKeyFile}
            onPickSaveLocation={actions.onPickNewKeyFilePath}
            onPickExisting={actions.onPickKeyFile}
            onChangeKeyFile={actions.onChangeKeyFile}
          />
        )}

        <VaultSettingsCard
          vaultName={vaultName}
          settings={fileInfo?.settings}
          format={fileInfo?.format}
          onChangeVaultSettings={actions.onChangeVaultSettings}
        />

        <UpgradeFormatCard format={fileInfo?.format} onUpgradeFormat={actions.onUpgradeFormat} />
      </div>
    </section>
  );
}
