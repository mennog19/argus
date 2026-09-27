import { useState } from "react";
import { useAsyncAction } from "../use-async-action";
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
  const [status, setStatus] = useState<string | undefined>(undefined);
  const { busy, error, run: runAction } = useAsyncAction();

  async function run(
    transfer: () => Promise<string | undefined>,
    succeeded: (filePath: string) => string,
    failed: string,
  ) {
    setStatus(undefined);
    await runAction(async () => {
      // Undefined means the user cancelled the file dialog, which is neither
      // a success to report nor a failure to explain.
      const filePath = await transfer();
      if (filePath) {
        setStatus(succeeded(filePath));
      }
    }, failed);
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
