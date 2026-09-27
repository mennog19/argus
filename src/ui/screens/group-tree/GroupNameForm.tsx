interface GroupNameFormProps {
  label: string;
  indent: number;
  draft: string;
  error: string | undefined;
  busy: boolean;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function GroupNameForm({
  label,
  indent,
  draft,
  error,
  busy,
  onDraftChange,
  onSave,
  onCancel,
}: GroupNameFormProps) {
  return (
    <form
      className="group-composer"
      style={{ marginLeft: indent }}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <input
        type="text"
        className="group-composer-input"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
        }}
        placeholder="Group name"
        aria-label={label}
        aria-invalid={error !== undefined}
        autoFocus
      />
      {error && <div className="group-composer-error">{error}</div>}
      <div className="group-composer-actions">
        <button type="button" className="group-composer-cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="group-composer-save" disabled={busy}>
          Save
        </button>
      </div>
    </form>
  );
}
