import { basename } from "../format";

interface KeyFileFieldProps {
  /** The chosen key file, or `undefined` for a password-only unlock. */
  keyFilePath: string | undefined;
  /** Prompts for a key file; resolves to `undefined` when the user cancels. */
  onPick: () => Promise<string | undefined>;
  onChange: (keyFilePath: string | undefined) => void;
  disabled?: boolean;
}

/**
 * The optional key file half of a vault's key, for the vaults KeePass and
 * KeePassXC let users lock with one. Tucked behind a link until it's needed,
 * since most vaults use a password alone.
 */
export function KeyFileField({ keyFilePath, onPick, onChange, disabled }: KeyFileFieldProps) {
  async function choose() {
    const picked = await onPick();
    if (picked) {
      onChange(picked);
    }
  }

  if (keyFilePath === undefined) {
    return (
      <button
        type="button"
        className="link-muted key-file-choose"
        onClick={() => void choose()}
        disabled={disabled}
      >
        Use a key file…
      </button>
    );
  }

  return (
    <div className="key-file-field">
      <span className="key-file-name" title={keyFilePath}>
        Key file: {basename(keyFilePath)}
      </span>
      <button
        type="button"
        className="link-muted"
        onClick={() => onChange(undefined)}
        disabled={disabled}
        aria-label="Remove key file"
      >
        Remove
      </button>
    </div>
  );
}
