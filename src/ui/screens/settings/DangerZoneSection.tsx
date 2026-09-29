import { MasterPasswordChangeResult } from "../../../application/vault-access-service";
import { ChangeMasterPasswordCard } from "../ChangeMasterPasswordCard";

interface DangerZoneSectionProps {
  /** Why the last merge attempt never got started, e.g. the picked file is this vault. */
  mergeError: string | undefined;
  onOpenMergeWizard: () => void;
  onChangeMasterPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<MasterPasswordChangeResult>;
}

export function DangerZoneSection({
  mergeError,
  onOpenMergeWizard,
  onChangeMasterPassword,
}: DangerZoneSectionProps) {
  return (
    <section className="detail-section danger-zone">
      <div className="detail-section-label danger-zone-label">Danger zone</div>
      <p className="danger-zone-lead">
        These change the vault itself. Both are applied straight to the file on disk — make sure you
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

        <ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />
      </div>
    </section>
  );
}
