import { FormEvent, useState } from "react";
import { Vault } from "../../domain";
import { VaultMergeSource } from "../../application/vault-merge-source";
import { useAsyncAction } from "../use-async-action";
import { basename } from "../format";
import { KeyFileField } from "./KeyFileField";

interface MergeUnlockDialogProps {
  filePath: string;
  mergeSource: VaultMergeSource;
  onUnlocked: (sourceVault: Vault) => void;
  onCancel: () => void;
}

/**
 * Asks for the picked file's master password in place, over whatever screen
 * launched the merge. Only once it opens does the full-screen wizard take
 * over, so a wrong password never costs the user their place.
 */
export function MergeUnlockDialog({
  filePath,
  mergeSource,
  onUnlocked,
  onCancel,
}: MergeUnlockDialogProps) {
  const [password, setPassword] = useState("");
  const [keyFilePath, setKeyFilePath] = useState<string | undefined>(undefined);
  const { busy, error, run } = useAsyncAction();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const opened = await mergeSource.openFile(filePath, password, keyFilePath);
      setPassword("");
      onUnlocked(opened);
    }, "Failed to open vault.");
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-card merge-unlock-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-unlock-title"
      >
        <h2 id="merge-unlock-title">Merge another vault in</h2>
        <p>
          Unlock <strong>{basename(filePath)}</strong> to compare it against this vault. Nothing is
          changed until you review every difference and apply the merge.
        </p>
        <form className="merge-unlock-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="field-group">
            <label className="field-label" htmlFor="merge-master-password">
              Its master password
            </label>
            <input
              id="merge-master-password"
              type="password"
              className="field-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Master password"
              autoFocus
            />
          </div>
          <KeyFileField
            keyFilePath={keyFilePath}
            onPick={() => mergeSource.pickKeyFile()}
            onChange={setKeyFilePath}
            disabled={busy}
          />
          {error && <div className="field-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              Unlock &amp; compare
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
