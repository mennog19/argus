import { useContext, useState } from "react";
import {
  CustomField,
  CustomFields,
  CustomIcon,
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
import { EntryFieldVisibility } from "../../application/settings";
import { useCustomIcons } from "../entry-icons/custom-icons-context";
import { IconPicker } from "../entry-icons/IconPicker";
import { parseDateTimeLocalValue, toDateTimeLocalValue } from "../format";
import { EyeIcon, EyeOffIcon } from "../icons";
import { useAsyncAction } from "../use-async-action";
import { ShortcutsContext, useShortcuts } from "../use-shortcuts";
import { GroupOption } from "../vault-browsing";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { TagsEditor } from "./TagsEditor";

/** Where the expiry date starts when the user first switches expiry on: a year out, as KeePass does. */
function defaultExpiry(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date;
}

interface EntryFormProps {
  initialEntry?: Entry;
  initialGroupId: string;
  groupOptions: readonly GroupOption[];
  generatorPolicy: PasswordPolicyOptions;
  fieldVisibility: EntryFieldVisibility;
  /** `added` is a just-uploaded image the entry's icon points at, to be saved with it. */
  onSubmit: (entry: Entry, groupId: GroupId, added?: CustomIcon) => Promise<void>;
  onCancel: () => void;
}

export function EntryForm({
  initialEntry,
  initialGroupId,
  groupOptions,
  generatorPolicy,
  fieldVisibility,
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
  // Images uploaded while editing; only the one the entry ends up using is saved.
  const [uploadedIcons, setUploadedIcons] = useState<readonly CustomIcon[]>([]);
  const customIcons = useCustomIcons().icons;
  const [expires, setExpires] = useState(initialEntry?.expiresAt !== undefined);
  const [expiryInput, setExpiryInput] = useState(
    initialEntry?.expiresAt ? toDateTimeLocalValue(initialEntry.expiresAt) : "",
  );
  const { busy, error, run, fail } = useAsyncAction();
  const shortcuts = useContext(ShortcutsContext);

  function handleGenerate() {
    const generated = generatePassword(new PasswordPolicy(generatorPolicy));
    setPassword(generated.reveal());
    setRevealed(true);
  }

  // The save shortcut does what the Save button does, and like the button
  // does nothing while a save is already under way.
  useShortcuts(shortcuts, { saveEntry: busy ? undefined : () => void submit() });

  async function submit() {
    if (title.trim() === "") {
      fail("Title is required.");
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
          fail("Invalid TOTP secret or otpauth:// URI.");
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

    let expiresAt: Date | undefined;
    if (expires) {
      expiresAt = parseDateTimeLocalValue(expiryInput);
      if (!expiresAt) {
        fail("Pick an expiry date, or turn expiry off.");
        return;
      }
      // The input only has minute precision; an untouched date keeps its
      // stored seconds, so opening and saving an entry isn't an edit.
      const initialExpiresAt = initialEntry?.expiresAt;
      if (initialExpiresAt && toDateTimeLocalValue(initialExpiresAt) === expiryInput) {
        expiresAt = initialExpiresAt;
      }
    }

    const added =
      icon.kind === "custom" ? uploadedIcons.find((upload) => upload.id === icon.key) : undefined;
    // An icon deleted from the vault while this form was open can't be
    // pointed at any more; the entry falls back to automatic, as it would
    // have had it been saved before the delete.
    const deleted =
      icon.kind === "custom" &&
      !added &&
      !customIcons.has(icon.key) &&
      !initialEntry?.icon.equals(icon);

    const fields = {
      title,
      username,
      password: new Password(password),
      url,
      notes,
      tags,
      customFields,
      icon: deleted ? Icon.AUTO : icon,
      expiresAt,
    };
    const entry = initialEntry ? initialEntry.update(fields) : Entry.create(fields);

    await run(() => onSubmit(entry, GroupId.fromString(groupId), added), "Failed to save entry.");
  }

  return (
    <form
      className="entry-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <IconPicker
        value={icon}
        title={title}
        url={url}
        onChange={(chosen, added) => {
          setIcon(chosen);
          if (added) {
            setUploadedIcons((current) => [...current, added]);
          }
        }}
      />

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

      {fieldVisibility.username && (
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
      )}

      {fieldVisibility.password && (
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
          <PasswordStrengthMeter password={password} />
        </div>
      )}

      {fieldVisibility.totp && (
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
      )}

      {fieldVisibility.url && (
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
      )}

      {fieldVisibility.notes && (
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
      )}

      {fieldVisibility.group && (
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
      )}

      {fieldVisibility.tags && (
        <div className="field-group">
          <span className="field-label">Tags</span>
          <TagsEditor tags={tags} onChange={setTags} />
        </div>
      )}

      {fieldVisibility.expiry && (
        <div className="field-group">
          <label className="field-label" htmlFor="entry-expires-at">
            Expires
          </label>
          <div className="entry-expiry-field">
            <input
              type="checkbox"
              aria-label="Entry expires"
              checked={expires}
              onChange={(event) => {
                setExpires(event.target.checked);
                if (event.target.checked && expiryInput === "") {
                  setExpiryInput(toDateTimeLocalValue(defaultExpiry()));
                }
              }}
            />
            <input
              id="entry-expires-at"
              type="datetime-local"
              className="field-input"
              value={expiryInput}
              disabled={!expires}
              onChange={(event) => setExpiryInput(event.target.value)}
            />
          </div>
        </div>
      )}

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
