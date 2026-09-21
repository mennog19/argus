import { checkPasswordHealth, Entry, EntryPasswordAge, Group, PasswordHealthPolicy } from "../../domain";
import { initialOf } from "../format";
import { EntryWithGroup } from "../vault-browsing";

interface HealthScreenProps {
  entries: readonly EntryWithGroup[];
  passwordChangedTimes: ReadonlyMap<string, Date>;
  onSelectEntry: (entry: Entry, group: Group) => void;
}

function entryRow(
  entry: Entry,
  groupByEntryId: Map<string, Group>,
  onSelectEntry: (entry: Entry, group: Group) => void,
) {
  // Every entry rendered here came from `entries`, which is what built
  // `groupByEntryId` in the first place, so a lookup miss can't happen.
  const group = groupByEntryId.get(entry.id.toString())!;
  return (
    <button
      key={entry.id.toString()}
      type="button"
      className="entry-row"
      onClick={() => onSelectEntry(entry, group)}
    >
      <div className="entry-avatar">{initialOf(entry.title)}</div>
      <div className="entry-row-text">
        <div className="entry-row-title">{entry.title || "(untitled)"}</div>
        <div className="entry-row-username">{group.name}</div>
      </div>
    </button>
  );
}

export function HealthScreen({ entries, passwordChangedTimes, onSelectEntry }: HealthScreenProps) {
  const groupByEntryId = new Map(entries.map(({ entry, group }) => [entry.id.toString(), group]));
  const ages: EntryPasswordAge[] = entries.map(({ entry }) => ({
    entry,
    changedAt: passwordChangedTimes.get(entry.id.toString()) ?? new Date(),
  }));
  const report = checkPasswordHealth(ages, new PasswordHealthPolicy());
  const isClean =
    report.duplicates.length === 0 && report.weak.length === 0 && report.stale.length === 0;

  return (
    <div className="detail-pane">
      <div className="detail-content">
        <h1 className="detail-title">Password Health</h1>

        {isClean && (
          <div className="detail-card padded">No password health issues found.</div>
        )}

        {report.duplicates.length > 0 && (
          <div className="detail-card padded">
            <div className="field-label">Reused passwords</div>
            {report.duplicates.map((group, index) => (
              <div className="health-group" key={index}>
                {group.map((entry) => entryRow(entry, groupByEntryId, onSelectEntry))}
              </div>
            ))}
          </div>
        )}

        {report.weak.length > 0 && (
          <div className="detail-card padded">
            <div className="field-label">Weak passwords</div>
            {report.weak.map((entry) => entryRow(entry, groupByEntryId, onSelectEntry))}
          </div>
        )}

        {report.stale.length > 0 && (
          <div className="detail-card padded">
            <div className="field-label">Stale passwords</div>
            {report.stale.map((entry) => entryRow(entry, groupByEntryId, onSelectEntry))}
          </div>
        )}
      </div>
    </div>
  );
}
