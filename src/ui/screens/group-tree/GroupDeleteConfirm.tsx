import { GroupDeleteMode } from "../../../application/settings";

interface GroupDeleteConfirmProps {
  groupName: string;
  indent: number;
  groupDeleteMode: GroupDeleteMode;
  error: string | undefined;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function GroupDeleteConfirm({
  groupName,
  indent,
  groupDeleteMode,
  error,
  busy,
  onCancel,
  onConfirm,
}: GroupDeleteConfirmProps) {
  return (
    <div className="group-composer group-composer-danger" style={{ marginLeft: indent }}>
      <span className="group-composer-title">Delete &quot;{groupName}&quot;?</span>
      <span className="group-composer-hint">
        {groupDeleteMode === "keepContents"
          ? "Its entries and subgroups will move to the parent group."
          : "Its entries and subgroups will be deleted too."}
      </span>
      {error && <div className="group-composer-error">{error}</div>}
      <div className="group-composer-actions">
        <button type="button" className="group-composer-cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="group-composer-delete" onClick={onConfirm} disabled={busy}>
          Delete
        </button>
      </div>
    </div>
  );
}
