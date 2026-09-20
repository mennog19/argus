import { FormEvent, useState } from "react";
import { CustomFields, Entry, GroupId, Password, Tags } from "../../domain";
import { GroupOption } from "../vault-browsing";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import { TagsEditor } from "./TagsEditor";

interface EntryFormProps {
  initialEntry?: Entry;
  initialGroupId: string;
  groupOptions: readonly GroupOption[];
  onSubmit: (entry: Entry, groupId: GroupId) => Promise<void>;
  onCancel: () => void;
}

export function EntryForm({ initialEntry, initialGroupId, groupOptions, onSubmit, onCancel }: EntryFormProps) {
  const [title, setTitle] = useState(initialEntry?.title ?? "");
  const [username, setUsername] = useState(initialEntry?.username ?? "");
  const [password, setPassword] = useState(initialEntry?.password.reveal() ?? "");
  const [revealed, setRevealed] = useState(false);
  const [url, setUrl] = useState(initialEntry?.url ?? "");
  const [notes, setNotes] = useState(initialEntry?.notes ?? "");
  const [groupId, setGroupId] = useState(initialGroupId);
  const [tags, setTags] = useState(initialEntry?.tags ?? new Tags());
  const [customFields, setCustomFields] = useState(initialEntry?.customFields ?? new CustomFields());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === "") {
      setError("Title is required.");
      return;
    }

    const fields = {
      title,
      username,
      password: new Password(password),
      url,
      notes,
      tags,
      customFields,
    };
    const entry = initialEntry ? initialEntry.update(fields) : Entry.create(fields);

    setBusy(true);
    setError(undefined);
    try {
      await onSubmit(entry, GroupId.fromString(groupId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save entry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={(event) => void handleSubmit(event)}>
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
          <button type="button" onClick={() => setRevealed((value) => !value)}>
            {revealed ? "Hide" : "Show"}
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

      <div className="field-group">
        <span className="field-label">Custom fields</span>
        <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
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
