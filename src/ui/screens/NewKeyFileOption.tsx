import { basename } from "../format";
import { NewKeyFileChoice } from "../new-key-file-choice";

interface NewKeyFileOptionProps {
  choice: NewKeyFileChoice;
  onChange: (choice: NewKeyFileChoice) => void;
  /** Where to save a generated key file; `undefined` when the user cancels. */
  onPickSaveLocation: () => Promise<string | undefined>;
  /** An existing file to use as the key file; `undefined` when the user cancels. */
  onPickExisting: () => Promise<string | undefined>;
  disabled?: boolean;
}

/**
 * Opt-in key file protection for a new vault, on top of its master password.
 * Off by default: a lost key file locks the owner out for good, so it's a
 * choice worth making deliberately, with the warning in view.
 */
export function NewKeyFileOption({
  choice,
  onChange,
  onPickSaveLocation,
  onPickExisting,
  disabled,
}: NewKeyFileOptionProps) {
  const generating = choice.kind === "generate";

  async function pickPath() {
    const path = await (generating ? onPickSaveLocation() : onPickExisting());
    if (path) {
      onChange({ ...choice, path });
    }
  }

  return (
    <div className="new-key-file">
      <label className="generator-checkbox">
        <input
          type="checkbox"
          checked={choice.enabled}
          onChange={(event) => onChange({ ...choice, enabled: event.target.checked })}
          disabled={disabled}
        />
        Also protect with a key file
      </label>

      {choice.enabled && (
        <>
          <div className="generator-mode-toggle" role="radiogroup" aria-label="Key file source">
            {(["generate", "existing"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={choice.kind === kind}
                className={`btn-secondary${choice.kind === kind ? " active" : ""}`}
                // A path picked for one kind means nothing for the other.
                onClick={() => onChange({ enabled: true, kind })}
                disabled={disabled}
              >
                {kind === "generate" ? "Generate new" : "Use existing file"}
              </button>
            ))}
          </div>

          {choice.path === undefined ? (
            <button
              type="button"
              className="link-muted key-file-choose"
              onClick={() => void pickPath()}
              disabled={disabled}
            >
              {generating ? "Choose where to save it…" : "Choose a file…"}
            </button>
          ) : (
            <div className="key-file-field">
              <span className="key-file-name" title={choice.path}>
                {generating ? "Saves to" : "Key file"}: {basename(choice.path)}
              </span>
              <button
                type="button"
                className="link-muted"
                onClick={() => void pickPath()}
                disabled={disabled}
                aria-label={generating ? "Change where the key file is saved" : "Change key file"}
              >
                Change…
              </button>
            </div>
          )}

          <p className="key-file-warning">
            {generating
              ? "Without this file the vault can't be opened. Keep a copy somewhere safe, not next to the vault."
              : "Without this file the vault can't be opened, and it must never change: even re-saving it locks you out."}
          </p>
        </>
      )}
    </div>
  );
}
