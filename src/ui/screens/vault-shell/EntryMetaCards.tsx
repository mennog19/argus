import { CustomField, Entry, Group } from "../../../domain";
import { formatDateTime } from "../../format";

interface EntryMetaCardsProps {
  entry: Entry;
  group: Group;
  /** Custom fields not already shown elsewhere in the detail pane. */
  customFields: readonly CustomField[];
}

export function EntryMetaCards({ entry, group, customFields }: EntryMetaCardsProps) {
  return (
    <>
      <div className="detail-card padded">
        <div className="detail-meta-row">
          <span>Group</span>
          <span>{group.name}</span>
        </div>
        {entry.expiresAt && (
          <div className="detail-meta-row">
            <span>{entry.isExpired(new Date()) ? "Expired" : "Expires"}</span>
            <span>{formatDateTime(entry.expiresAt)}</span>
          </div>
        )}
      </div>

      {entry.notes && (
        <div className="detail-card padded">
          <div className="field-label">Notes</div>
          <div className="detail-notes">{entry.notes}</div>
        </div>
      )}

      {entry.tags.values.length > 0 && (
        <div className="detail-card padded">
          <div className="field-label">Tags</div>
          <div className="tag-chips">
            {entry.tags.values.map((tag) => (
              <span key={tag.toString()} className="tag-chip">
                {tag.toString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {customFields.length > 0 && (
        <div className="detail-card padded">
          <div className="field-label">Custom fields</div>
          {customFields.map((field) => (
            <div className="detail-meta-row" key={field.key}>
              <span>{field.key}</span>
              <span>{field.isProtected ? "••••••••" : field.value}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
