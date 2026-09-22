import { FormEvent, useState } from "react";
import {
  CustomField,
  CustomFields,
  Entry,
  Icon,
  generatePassword,
  GroupId,
  parseTotpInput,
  Password,
  PasswordPolicy,
  PasswordPolicyOptions,
  Tags,
  TOTP_FIELD_KEYS,
  totpConfigFromCustomFields,
} from "../../domain";
import { IconPicker } from "../entry-icons/IconPicker";
import { EyeIcon, EyeOffIcon } from "../icons";
import { errorMessage } from "../error-message";
import { GroupOption } from "../vault-browsing";
import { TagsEditor } from "./TagsEditor";

interface EntryFormProps {
  initialEntry?: Entry;
  initialGroupId: string;
  groupOptions: readonly GroupOption[];
  generatorPolicy: PasswordPolicyOptions;
  onSubmit: (entry: Entry, groupId: GroupId) => Promise<void>;
  onCancel: () => void;
}

export function EntryForm({
  initialEntry,
  initialGroupId,
  groupOptions,
  generatorPolicy,
  onSubmit,
  onCancel,
}: EntryFormProps) {
  const [title, setTitle] = useState(initialEntry?.title ?? "");
  const [username, setUsername] = useState(initialEntry?.username ?? "");
  const [password, setPassword] = useState(initialEntry?.password.reveal() ?? "");
  const [revealed, setRevealed] = useState(false);
  const initialCustomFields = initialEntry?.customFields ?? new CustomFields();
  // Prefer the raw `otp` field verbatim (byte-for-byte fidelity for what's
  // actually stored); only synthesize a URI when the entry instead uses the
  // classic TOTP Seed/Settings pair, which has no single raw value to show.
  const initialTotpValue =
    initialCustomFields.get("otp")?.value ??
    totpConfigFromCustomFields(initialCustomFields)?.toOtpauthUri(initialEntry?.title ?? "") ??
    "";
  const [totpInput, setTotpInput] = useState(initialTotpValue);
  const [totpRevealed, setTotpRevealed] = useState(false);
  const [url, setUrl] = useState(initialEntry?.url ?? "");
  const [notes, setNotes] = useState(initialEntry?.notes ?? "");
  const [groupId, setGroupId] = useState(initialGroupId);
  const [tags, setTags] = useState(initialEntry?.tags ?? new Tags());
  const [icon, setIcon] = useState(initialEntry?.icon ?? Icon.AUTO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  function handleGenerate() {
    const generated = generatePassword(new PasswordPolicy(generatorPolicy));
    setPassword(generated.reveal());
    setRevealed(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === "") {
      setError("Title is required.");
      return;
    }

    // Only touch the TOTP custom field(s) if the user actually edited the
    // input — otherwise an entry's existing TOTP data (in whichever
    // convention it was stored under) passes through untouched.
    let customFields = initialCustomFields;
    const trimmedTotp = totpInput.trim();
    if (trimmedTotp !== initialTotpValue) {
      const withoutTotpFields = Array.from(TOTP_FIELD_KEYS).reduce(
        (fields, key) => fields.remove(key),
        initialCustomFields,
      );
      if (trimmedTotp === "") {
        customFields = withoutTotpFields;
      } else {
        const totpConfig = parseTotpInput(trimmedTotp);
        if (!totpConfig) {
          setError("Invalid TOTP secret or otpauth:// URI.");
          return;
        }
        // A pasted otpauth:// URI is stored exactly as given, preserving its
        // issuer/label/param order; a bare secret has no URI to preserve, so
        // one is synthesized from the entry's title.
        const otpValue = trimmedTotp.toLowerCase().startsWith("otpauth://")
          ? trimmedTotp
          : totpConfig.toOtpauthUri(title.trim());
        customFields = withoutTotpFields.set(new CustomField("otp", otpValue, true));
      }
    }

    const fields = {
      title,
      username,
      password: new Password(password),
      url,
      notes,
      tags,
      customFields,
      icon,
    };
    const entry = initialEntry ? initialEntry.update(fields) : Entry.create(fields);

    setBusy(true);
    setError(undefined);
    try {
      await onSubmit(entry, GroupId.fromString(groupId));
    } catch (cause) {
      setError(errorMessage(cause, "Failed to save entry."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={(event) => void handleSubmit(event)}>
      <IconPicker value={icon} title={title} url={url} onChange={setIcon} />

      <div className="field-group">
        <label className="field-label" htmlFor="entry-title">
          Title
        </label>
        <input
          id="entry-title"
          type="text"
          className="field-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="entry-username">
          Username
        </label>
        <input
          id="entry-username"
          type="text"
          className="field-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="entry-password">
          Password
        </label>
        <div className="field-input-with-action">
          <input
            id="entry-password"
            type={revealed ? "text" : "password"}
            className="field-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="button" onClick={handleGenerate}>
            Generate
          </button>
          <button
            type="button"
            className="field-reveal-button"
            aria-label={revealed ? "Hide password" : "Show password"}
            title={revealed ? "Hide password" : "Show password"}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="entry-totp">
          Authenticator (TOTP)
        </label>
        <div className="field-input-with-action">
          <input
            id="entry-totp"
            type={totpRevealed ? "text" : "password"}
            className="field-input"
            placeholder="Secret key or otpauth:// URI"
            value={totpInput}
            onChange={(event) => setTotpInput(event.target.value)}
          />
          <button
            type="button"
            className="field-reveal-button"
            aria-label={totpRevealed ? "Hide authenticator secret" : "Show authenticator secret"}
            title={totpRevealed ? "Hide authenticator secret" : "Show authenticator secret"}
            onClick={() => setTotpRevealed((value) => !value)}
          >
            {totpRevealed ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="entry-url">
          URL
        </label>
        <input
          id="entry-url"
          type="text"
          className="field-input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="entry-notes">
          Notes
        </label>
        <textarea
          id="entry-notes"
          className="field-textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="entry-group">
          Group
        </label>
        <select
          id="entry-group"
          className="field-select"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
        >
          {groupOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field-group">
        <span className="field-label">Tags</span>
        <TagsEditor tags={tags} onChange={setTags} />
      </div>

      {error && <div className="field-error">{error}</div>}

      <div className="entry-form-actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          Save
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
