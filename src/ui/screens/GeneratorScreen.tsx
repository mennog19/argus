import { useEffect, useState } from "react";
import { ClipboardWriter } from "../../application/clipboard";
import {
  generatePassword,
  PassphraseSeparator,
  PasswordPolicy,
  PasswordPolicyMode,
  PasswordPolicyOptions,
} from "../../domain";
import { CopyIcon, RefreshIcon } from "../icons";

interface GeneratorScreenProps {
  policyOptions: PasswordPolicyOptions;
  onPolicyChange: (options: PasswordPolicyOptions) => void;
  clipboardWriter: ClipboardWriter;
}

/** How long the "Copied" confirmation stays up next to the button. */
const COPIED_LABEL_MS = 1500;

const SEPARATORS: readonly { value: PassphraseSeparator; label: string }[] = [
  { value: "-", label: "Hyphen (-)" },
  { value: "_", label: "Underscore (_)" },
  { value: " ", label: "Space" },
  { value: ".", label: "Period (.)" },
];

export function GeneratorScreen({
  policyOptions,
  onPolicyChange,
  clipboardWriter,
}: GeneratorScreenProps) {
  const policy = new PasswordPolicy(policyOptions);
  const [password, setPassword] = useState(() => generatePassword(policy).reveal());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_LABEL_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  // `PasswordPolicy`'s constructor already rejects invalid combinations (e.g.
  // every character set disabled, or a length/word count below 1) — reuse
  // that instead of re-deriving the same rules here, and just ignore an
  // update that would produce one.
  function applyPolicy(patch: Partial<PasswordPolicyOptions>) {
    const nextOptions: PasswordPolicyOptions = { ...policyOptions, ...patch };
    try {
      const nextPolicy = new PasswordPolicy(nextOptions);
      onPolicyChange(nextOptions);
      setPassword(generatePassword(nextPolicy).reveal());
    } catch {
      // Invalid combination — leave the current settings and password as-is.
    }
  }

  function regenerate() {
    setPassword(generatePassword(policy).reveal());
  }

  // Deliberately no auto-clear countdown here: a freshly generated password
  // isn't stored in the vault yet, and the user is typically about to paste
  // it into a sign-up form.
  async function copyPassword() {
    await clipboardWriter.writeText(password);
    setCopied(true);
  }

  function setMode(mode: PasswordPolicyMode) {
    applyPolicy({ mode });
  }

  return (
    <div className="detail-pane generator-screen">
      <div className="detail-content">
        <h1 className="detail-title">Password Generator</h1>

        <div className="detail-card padded generator-output">
          <div className="generator-password">{password}</div>
          <div className="generator-actions">
            {copied && <span className="copied-label">Copied</span>}
            <button
              type="button"
              className="icon-button"
              aria-label="Copy password"
              onClick={() => void copyPassword()}
            >
              <CopyIcon size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Regenerate password"
              onClick={regenerate}
            >
              <RefreshIcon size={18} />
            </button>
          </div>
        </div>

        <div className="generator-mode-toggle" role="group" aria-label="Generator mode">
          <button
            type="button"
            className={`btn-secondary${policy.mode === "characters" ? " active" : ""}`}
            onClick={() => setMode("characters")}
          >
            Characters
          </button>
          <button
            type="button"
            className={`btn-secondary${policy.mode === "passphrase" ? " active" : ""}`}
            onClick={() => setMode("passphrase")}
          >
            Passphrase
          </button>
        </div>

        {policy.mode === "characters" ? (
          <div className="generator-options">
            <div className="field-group">
              <label className="field-label" htmlFor="generator-length">
                Length: {policy.length}
              </label>
              <input
                id="generator-length"
                type="range"
                min={4}
                max={64}
                value={policy.length}
                onChange={(event) => applyPolicy({ length: Number(event.target.value) })}
              />
            </div>

            <label className="generator-checkbox">
              <input
                type="checkbox"
                checked={policy.useUppercase}
                onChange={(event) => applyPolicy({ useUppercase: event.target.checked })}
              />
              Uppercase (A-Z)
            </label>
            <label className="generator-checkbox">
              <input
                type="checkbox"
                checked={policy.useLowercase}
                onChange={(event) => applyPolicy({ useLowercase: event.target.checked })}
              />
              Lowercase (a-z)
            </label>
            <label className="generator-checkbox">
              <input
                type="checkbox"
                checked={policy.useDigits}
                onChange={(event) => applyPolicy({ useDigits: event.target.checked })}
              />
              Digits (0-9)
            </label>
            <label className="generator-checkbox">
              <input
                type="checkbox"
                checked={policy.useSymbols}
                onChange={(event) => applyPolicy({ useSymbols: event.target.checked })}
              />
              Symbols (!@#$…)
            </label>
            <label className="generator-checkbox">
              <input
                type="checkbox"
                checked={policy.excludeAmbiguous}
                onChange={(event) => applyPolicy({ excludeAmbiguous: event.target.checked })}
              />
              Exclude ambiguous characters (I, l, 1, O, 0, o)
            </label>
          </div>
        ) : (
          <div className="generator-options">
            <div className="field-group">
              <label className="field-label" htmlFor="generator-word-count">
                Word count: {policy.wordCount}
              </label>
              <input
                id="generator-word-count"
                type="range"
                min={1}
                max={10}
                value={policy.wordCount}
                onChange={(event) => applyPolicy({ wordCount: Number(event.target.value) })}
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="generator-separator">
                Separator
              </label>
              <select
                id="generator-separator"
                className="field-select"
                value={policy.separator}
                onChange={(event) =>
                  applyPolicy({ separator: event.target.value as PassphraseSeparator })
                }
              >
                {SEPARATORS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
