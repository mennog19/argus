import { FormEvent, useState } from "react";
import { KeyFileChange, KeyFileChangeResult } from "../../application/vault-access-service";
import { basename } from "../format";
import { useAsyncAction } from "../use-async-action";
import { RekeyedBackupsNotes } from "./RekeyedBackupsNotes";

type ChangeKind = KeyFileChange["kind"];

interface ChangeKeyFileCardProps {
  /** Whether the open vault's key includes a key file. */
  hasKeyFile: boolean;
  /** Where to save a generated key file; `undefined` when the user cancels. */
  onPickSaveLocation: () => Promise<string | undefined>;
  /** An existing file to use as the key file; `undefined` when the user cancels. */
  onPickExisting: () => Promise<string | undefined>;
  onChangeKeyFile: (currentPassword: string, change: KeyFileChange) => Promise<KeyFileChangeResult>;
}

const KIND_LABELS: Record<ChangeKind, string> = {
  generate: "Generate new",
  existing: "Use existing file",
  remove: "Remove key file",
};

const KIND_WARNINGS: Record<ChangeKind, string> = {
  generate:
    "Without this file the vault can't be opened. Keep a copy somewhere safe, not next to the vault.",
  existing:
    "Without this file the vault can't be opened, and it must never change: even re-saving it locks you out.",
  remove: "The vault will open with its master password alone.",
};

interface Done {
  result: KeyFileChangeResult;
  kind: ChangeKind;
}

/**
 * Adds a key file to the open vault, swaps it for another, or takes it away.
 * The master password stays as it is and is only asked for to confirm.
 */
export function ChangeKeyFileCard({
  hasKeyFile,
  onPickSaveLocation,
  onPickExisting,
  onChangeKeyFile,
}: ChangeKeyFileCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [kind, setKind] = useState<ChangeKind>("generate");
  const [path, setPath] = useState<string | undefined>(undefined);
  const { busy, error, run, fail, clearError } = useAsyncAction();
  const [done, setDone] = useState<Done | undefined>(undefined);

  const generating = kind === "generate";
  // Removing is only on offer while there is a key file to remove.
  const kinds: ChangeKind[] = hasKeyFile
    ? ["generate", "existing", "remove"]
    : ["generate", "existing"];

  const changeLabel = hasKeyFile ? "Change key file" : "Add key file";
  const submitLabel = kind === "remove" ? KIND_LABELS.remove : changeLabel;

  async function pickPath() {
    const picked = await (generating ? onPickSaveLocation() : onPickExisting());
    if (picked) {
      setPath(picked);
      clearError();
    }
  }

  function changeFor(): KeyFileChange | undefined {
    if (kind === "remove") {
      return { kind };
    }
    return path === undefined ? undefined : { kind, path };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setDone(undefined);

    const change = changeFor();
    if (!change) {
      fail(generating ? "Choose where to save the key file." : "Choose a key file.");
      return;
    }

    // Only on a confirmed success, as with a password change: the vault file
    // is re-encrypted by this.
    let result: KeyFileChangeResult | undefined;
    const changed = await run(async () => {
      result = await onChangeKeyFile(currentPassword, change);
    }, "Failed to change the key file.");
    if (changed) {
      setCurrentPassword("");
      setPath(undefined);
      setKind("generate");
      setDone({ result: result!, kind: change.kind });
    }
  }

  const heading = (
    <div className="danger-zone-row-text">
      <span className="danger-zone-row-title">Key file</span>
      <span className="danger-zone-row-hint">
        {hasKeyFile
          ? "This vault needs its key file as well as the master password. Lose either and there is no way back in."
          : "A file the vault needs as well as its master password. Lose it and there is no way back in."}
      </span>
    </div>
  );

  if (!revealed) {
    return (
      <div className="danger-zone-row">
        {heading}
        <button type="button" className="btn-danger-outline" onClick={() => setRevealed(true)}>
          {changeLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="danger-zone-row expanded">
      {heading}
      <form className="danger-zone-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="field-group">
          <label className="field-label" htmlFor="change-key-file-password">
            Confirm with your master password
          </label>
          <input
            id="change-key-file-password"
            type="password"
            className="field-input"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Master password"
          />
        </div>

        <div className="new-key-file">
          <div className="generator-mode-toggle" role="radiogroup" aria-label="Key file change">
            {kinds.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={kind === option}
                className={`btn-secondary${kind === option ? " active" : ""}`}
                // A path picked for one kind means nothing for the other.
                onClick={() => {
                  setKind(option);
                  setPath(undefined);
                  clearError();
                }}
                disabled={busy}
              >
                {KIND_LABELS[option]}
              </button>
            ))}
          </div>

          {kind !== "remove" &&
            (path === undefined ? (
              <button
                type="button"
                className="link-muted key-file-choose"
                onClick={() => void pickPath()}
                disabled={busy}
              >
                {generating ? "Choose where to save it…" : "Choose a file…"}
              </button>
            ) : (
              <div className="key-file-field">
                <span className="key-file-name" title={path}>
                  {generating ? "Saves to" : "Key file"}: {basename(path)}
                </span>
                <button
                  type="button"
                  className="link-muted"
                  onClick={() => void pickPath()}
                  disabled={busy}
                  aria-label={generating ? "Change where the key file is saved" : "Choose a different file"}
                >
                  Change…
                </button>
              </div>
            ))}

          <p className="key-file-warning">{KIND_WARNINGS[kind]}</p>
        </div>

        {error && <div className="field-error">{error}</div>}
        {done && (
          <>
            <div className="field-success">
              {done.kind === "remove" ? "Key file removed." : "Key file changed."}
            </div>
            <RekeyedBackupsNotes
              result={done.result}
              nowOpen={done.kind === "remove" ? "without the key file" : "with the new key file"}
              stillOpen="the way the vault did before"
            />
          </>
        )}
        <button type="submit" className="btn-danger" disabled={busy}>
          {busy ? "Re-encrypting…" : submitLabel}
        </button>
      </form>
    </div>
  );
}
