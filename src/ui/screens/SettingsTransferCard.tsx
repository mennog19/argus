import { useState } from "react";
import { errorMessage } from "../error-message";
import { basename } from "../format";

interface SettingsTransferCardProps {
  /** Resolves to the file written, or `undefined` if the user cancelled. */
  onExportSettings: () => Promise<string | undefined>;
  /** Resolves to the file read, or `undefined` if the user cancelled. */
  onImportSettings: () => Promise<string | undefined>;
}

export function SettingsTransferCard({
  onExportSettings,
  onImportSettings,
}: SettingsTransferCardProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  async function run(
    transfer: () => Promise<string | undefined>,
    succeeded: (filePath: string) => string,
    failed: string,
  ) {
    setBusy(true);
    setStatus(undefined);
    setError(undefined);
    try {
      const filePath = await transfer();
      if (filePath) {
        setStatus(succeeded(filePath));
      }
    } catch (cause) {
      setError(errorMessage(cause, failed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail-card padded">
      <p className="settings-transfer-lead">
        Save your appearance, security, group, and entry creation settings to a .json file you can
        share. Importing one replaces all of those settings with the file&apos;s. Your vaults,
        passwords, and recently opened files are never part of it.
      </p>
      <div className="settings-transfer-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() =>
            void run(
              onExportSettings,
              (filePath) => `Settings exported to ${basename(filePath)}.`,
              "Failed to export settings.",
            )
          }
        >
          Export settings…
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() =>
            void run(
              onImportSettings,
              (filePath) => `Settings imported from ${basename(filePath)}.`,
              "Failed to import settings.",
            )
          }
        >
          Import settings…
        </button>
      </div>
      {error && <div className="field-error">{error}</div>}
      {status && <div className="field-success">{status}</div>}
    </div>
  );
}
