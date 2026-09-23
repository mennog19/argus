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

/** Whole-percent share of `total`, for the KPI tiles and overview rows. */
function percentage(count: number, total: number): number {
  return Math.round((count / total) * 100);
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

/**
 * At-a-glance breakdown shown until a category is picked: how the vault's
 * passwords split across every category, rather than dropping the user
 * straight into one category's list.
 */
function HealthOverview({
  categories,
  total,
  healthyCount,
}: {
  categories: readonly Category[];
  total: number;
  healthyCount: number;
}) {
  const attentionCount = total - healthyCount;

  return (
    <div className="health-overview">
      <div className="health-overview-bar" aria-hidden="true">
        {categories
          .filter((category) => category.count > 0)
          .map((category) => (
            <div
              key={category.key}
              className={`health-overview-bar-segment ${category.severity}`}
              style={{ flexGrow: category.count }}
            />
          ))}
      </div>

      <ul className="health-overview-rows">
        {categories.map((category) => (
          <li className="health-overview-row" key={category.key}>
            <span className={`health-section-dot ${category.severity}`} />
            <span className="health-overview-row-label">{category.heading}</span>
            <span className="health-overview-row-count">{category.count}</span>
            <span className="health-overview-row-percent">
              {percentage(category.count, total)}%
            </span>
          </li>
        ))}
      </ul>

      <p className="health-overview-note">
        {attentionCount === 0
          ? "Every password looks healthy."
          : `${attentionCount} ${attentionCount === 1 ? "password needs" : "passwords need"} attention.`}
      </p>
      <p className="health-overview-hint">Pick a category above to list its entries.</p>
    </div>
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

  // No category is open to begin with: the overview is the landing view.
  const [selectedKey, setSelectedKey] = useState<CategoryKey | undefined>(undefined);
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
              <button
                type="button"
                className={`health-stat-card accent${selectedKey === undefined ? " selected" : ""}`}
                aria-pressed={selectedKey === undefined}
                onClick={() => setSelectedKey(undefined)}
              >
                <div className="health-stat-number accent">
                  {percentage(healthyCount, entries.length)}%
                </div>
                <div className="health-stat-label">Healthy</div>
              </button>

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

            {selected ? (
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
            ) : (
              <HealthOverview
                categories={categories}
                total={entries.length}
                healthyCount={healthyCount}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
