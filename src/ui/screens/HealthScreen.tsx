import { useState } from "react";
import { checkPasswordHealth, Entry, Group, PasswordHealthPolicy } from "../../domain";
import { EntryAvatar } from "../entry-icons/EntryAvatar";
import { EntryWithGroup } from "../vault-browsing";

interface HealthScreenProps {
  entries: readonly EntryWithGroup[];
  onSelectEntry: (entry: Entry, group: Group) => void;
}

type CategoryKey = "duplicates" | "weak" | "fair" | "strong";
type Severity = "warning" | "danger" | "neutral" | "success";

interface Category {
  readonly key: CategoryKey;
  readonly label: string;
  readonly heading: string;
  readonly severity: Severity;
  readonly groups: readonly (readonly Entry[])[];
  readonly count: number;
}

function healthEntryRow(
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
      className="health-entry-row"
      onClick={() => onSelectEntry(entry, group)}
    >
      <EntryAvatar entry={entry} />
      <div className="entry-row-text">
        <div className="entry-row-title">{entry.title || "(untitled)"}</div>
        <div className="entry-row-username">{entry.username || group.name}</div>
      </div>
      <span className="health-entry-action">View →</span>
    </button>
  );
}

export function HealthScreen({ entries, onSelectEntry }: HealthScreenProps) {
  const groupByEntryId = new Map(entries.map(({ entry, group }) => [entry.id.toString(), group]));
  const report = checkPasswordHealth(
    entries.map(({ entry }) => entry),
    new PasswordHealthPolicy(),
  );

  // Worst-first: reuse is prioritized over weak per `checkPasswordHealth`, and
  // that's also the order issues are worth a user's attention here.
  const categories: Category[] = [
    {
      key: "duplicates",
      label: "Reused",
      heading: "Reused passwords",
      severity: "warning",
      groups: report.duplicates,
      count: report.duplicates.reduce((total, group) => total + group.length, 0),
    },
    {
      key: "weak",
      label: "Weak",
      heading: "Weak passwords",
      severity: "danger",
      groups: [report.weak],
      count: report.weak.length,
    },
    {
      key: "fair",
      label: "Fair",
      heading: "Fair passwords",
      severity: "neutral",
      groups: [report.fair],
      count: report.fair.length,
    },
    {
      key: "strong",
      label: "Strong",
      heading: "Strong passwords",
      severity: "success",
      groups: [report.strong],
      count: report.strong.length,
    },
  ];

  const [selectedKey, setSelectedKey] = useState<CategoryKey | undefined>(
    () => categories.find((category) => category.count > 0)?.key,
  );
  const selected = categories.find((category) => category.key === selectedKey);

  const healthyCount = report.fair.length + report.strong.length;

  return (
    <div className="detail-pane">
      <div className="detail-content">
        <h1 className="detail-title">Password Health</h1>

        {entries.length === 0 ? (
          <div className="detail-card padded">No entries to check yet.</div>
        ) : (
          <>
            <p className="health-summary">
              {healthyCount} of {entries.length} passwords are healthy.
            </p>

            <div className="health-stats">
              {categories.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  className={`health-stat-card ${category.severity}${
                    category.key === selectedKey ? " selected" : ""
                  }`}
                  aria-pressed={category.key === selectedKey}
                  onClick={() =>
                    setSelectedKey(category.key === selectedKey ? undefined : category.key)
                  }
                >
                  <div className={`health-stat-number ${category.severity}`}>{category.count}</div>
                  <div className="health-stat-label">{category.label}</div>
                </button>
              ))}
            </div>

            {selected && (
              <div className="health-section">
                <div className="health-section-heading">
                  <span className={`health-section-dot ${selected.severity}`} />
                  {selected.heading}
                </div>
                {selected.count === 0 ? (
                  <div className="health-section-empty">No entries in this category.</div>
                ) : (
                  <div className="health-section-list">
                    {selected.groups.map((group, index) => (
                      <div className="health-group" key={index}>
                        {group.map((entry) => healthEntryRow(entry, groupByEntryId, onSelectEntry))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
