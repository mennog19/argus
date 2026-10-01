import { useState } from "react";
import { VaultFormat } from "../../../application/vault-repository";
import { formatVaultFormat } from "../../format";
import { useAsyncAction } from "../../use-async-action";

interface UpgradeFormatCardProps {
  /** The open vault's format, once known. */
  format: VaultFormat | undefined;
  onUpgradeFormat: () => Promise<void>;
}

/**
 * Offers to move a KDBX 3 vault to KDBX 4. Renders nothing for a vault that
 * is already KDBX 4, except straight after upgrading one, to confirm it.
 */
export function UpgradeFormatCard({ format, onUpgradeFormat }: UpgradeFormatCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const { busy, error, run } = useAsyncAction();

  async function upgrade() {
    const succeeded = await run(onUpgradeFormat, "Failed to upgrade the vault.");
    if (succeeded) {
      setConfirming(false);
      setUpgraded(true);
    }
  }

  if (upgraded) {
    return (
      <div className="danger-zone-row">
        <div className="danger-zone-row-text">
          <span className="danger-zone-row-title">File format</span>
          <span className="field-success">Upgraded to KDBX 4.</span>
          <span className="danger-zone-row-hint">
            A copy of the KDBX 3 file is kept next to it, with .kdbx3-backup.kdbx added to its name.
          </span>
        </div>
      </div>
    );
  }

  if (!format || format.major >= 4) {
    return null;
  }

  const heading = (
    <div className="danger-zone-row-text">
      <span className="danger-zone-row-title">File format</span>
      <span className="danger-zone-row-hint">
        This vault is {formatVaultFormat(format)}. KDBX 4 protects it with Argon2id, which makes
        guessing the master password far slower than KDBX 3&apos;s AES-KDF.
      </span>
    </div>
  );

  if (!confirming) {
    return (
      <div className="danger-zone-row">
        {heading}
        <button type="button" className="btn-danger-outline" onClick={() => setConfirming(true)}>
          Upgrade to KDBX 4
        </button>
      </div>
    );
  }

  return (
    <div className="danger-zone-row expanded">
      {heading}
      <div className="danger-zone-form">
        <div className="danger-zone-row-hint">
          KeePass 2.34 and older, KeePassX and other apps that only read KDBX 3 won&apos;t be able
          to open the vault afterwards; KeePass 2.35 or later and KeePassXC can. Argus can&apos;t
          convert it back.
        </div>
        {error && <div className="field-error">{error}</div>}
        <div className="danger-zone-actions">
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={() => void upgrade()}
          >
            {busy ? "Upgrading…" : "Upgrade to KDBX 4"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
