import { useState } from "react";
import { AvailableUpdate, UpdateDownloadProgress } from "../../application/updater";
import { errorMessage } from "../error-message";
import { formatFileSize } from "../format";

interface UpdateDialogProps {
  update: AvailableUpdate;
  /** Downloads and installs `update`. Only settles if that fails. */
  onInstall: (onProgress: (progress: UpdateDownloadProgress) => void) => Promise<void>;
  onDismiss: () => void;
}

function progressLabel({ downloadedBytes, totalBytes }: UpdateDownloadProgress): string {
  if (totalBytes === undefined || totalBytes === 0) {
    return `Downloading… ${formatFileSize(downloadedBytes)}`;
  }
  if (downloadedBytes >= totalBytes) {
    return "Installing…";
  }
  return `Downloading… ${Math.floor((downloadedBytes / totalBytes) * 100)}%`;
}

/** Offers the update the launch check found. */
export function UpdateDialog({ update, onInstall, onDismiss }: UpdateDialogProps) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateDownloadProgress | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  async function install() {
    setInstalling(true);
    setProgress(undefined);
    setError(undefined);
    try {
      await onInstall(setProgress);
    } catch (cause) {
      setError(errorMessage(cause, "Something went wrong."));
    }
    setInstalling(false);
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <h2 id="update-dialog-title">Update available</h2>
        <p>
          Argus {update.version} is available. You have {update.currentVersion}.
        </p>
        {update.notes !== undefined && <p className="update-notes">{update.notes}</p>}
        <p>
          Installing closes Argus and opens the new version when it&rsquo;s done. Your vault will be
          locked, and anything you haven&rsquo;t saved yet, like an entry you&rsquo;re still
          editing, is lost.
        </p>
        {error !== undefined && (
          <p className="field-error" role="alert">
            The update couldn&rsquo;t be installed: {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onDismiss} disabled={installing}>
            Not now
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void install()}
            disabled={installing}
          >
            {installing
              ? progress === undefined
                ? "Downloading…"
                : progressLabel(progress)
              : "Install and restart"}
          </button>
        </div>
      </div>
    </div>
  );
}
