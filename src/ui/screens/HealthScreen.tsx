import { useState } from "react";
import {
  checkPasswordHealth,
  Entry,
  Group,
  isFieldReference,
  PasswordHealthPolicy,
} from "../../domain";
import { EntryAvatar } from "../entry-icons/EntryAvatar";
import { EntryWithGroup } from "../vault-browsing";

interface HealthScreenProps {
  entries: readonly EntryWithGroup[];
  onSelectEntry: (entry: Entry, group: Group) => void;
}

type CategoryKey = "expired" | "duplicates" | "weak" | "fair" | "strong" | "noPassword";
type Severity = "warning" | "danger" | "neutral" | "success";

interface Category {
  readonly key: CategoryKey;
  readonly label: string;
  readonly heading: string;
  readonly severity: Severity;
  readonly groups: readonly (readonly Entry[])[];
  readonly count: number;
  /**
   * Whether this is one of the password categories, which split the rated
   * passwords between them. Expiry cuts across them, and an entry without a
   * password isn't rated, so both are left out of the bar.
   */
  readonly partitions: boolean;
}

/** Whole-percent share of `total`, for the KPI tiles and overview rows; 0 of nothing is 0%. */
function percentage(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
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
  passwordCount,
  healthyCount,
}: {
  categories: readonly Category[];
  /** Every entry checked, which is what each row's share is a share of. */
  total: number;
  /** The entries that have a password to rate. */
  passwordCount: number;
  healthyCount: number;
}) {
  const attentionCount = passwordCount - healthyCount;

  return (
    <div className="health-overview">
      <div className="health-overview-bar" aria-hidden="true">
        {categories
          .filter((category) => category.partitions && category.count > 0)
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

export function HealthScreen({ entries: allEntries, onSelectEntry }: HealthScreenProps) {
  // A `{REF:P@…}` password is another entry's password, not one of its own:
  // it's judged once, on the entry it points at, rather than showing up here
  // as "reused" every time something links to it.
  const entries = allEntries.filter(({ entry }) => !isFieldReference(entry.password.reveal()));
  const groupByEntryId = new Map(
    allEntries.map(({ entry, group }) => [entry.id.toString(), group]),
  );
  const report = checkPasswordHealth(
    entries.map(({ entry }) => entry),
    new PasswordHealthPolicy(),
  );
  // Expiry is about the entry, not its password, so a linked entry counts too.
  const now = new Date();
  const expired = allEntries.map(({ entry }) => entry).filter((entry) => entry.isExpired(now));
  const expiredIds = new Set(expired.map((entry) => entry.id.toString()));

  // Worst-first: an expired entry is past its use-by date whatever its
  // password; reuse is prioritized over weak per `checkPasswordHealth`, and
  // that's also the order issues are worth a user's attention here.
  const categories: Category[] = [
    {
      key: "expired",
      label: "Expired",
      heading: "Expired entries",
      severity: "danger",
      groups: [expired],
      count: expired.length,
      partitions: false,
    },
    {
      key: "duplicates",
      label: "Reused",
      heading: "Reused passwords",
      severity: "warning",
      groups: report.duplicates,
      count: report.duplicates.reduce((total, group) => total + group.length, 0),
      partitions: true,
    },
    {
      key: "weak",
      label: "Weak",
      heading: "Weak passwords",
      severity: "danger",
      groups: [report.weak],
      count: report.weak.length,
      partitions: true,
    },
    {
      key: "fair",
      label: "Fair",
      heading: "Fair passwords",
      severity: "neutral",
      groups: [report.fair],
      count: report.fair.length,
      partitions: true,
    },
    {
      key: "strong",
      label: "Strong",
      heading: "Strong passwords",
      severity: "success",
      groups: [report.strong],
      count: report.strong.length,
      partitions: true,
    },
    {
      key: "noPassword",
      label: "No password",
      heading: "Entries without a password",
      severity: "neutral",
      groups: [report.noPassword],
      count: report.noPassword.length,
      partitions: false,
    },
  ];

  // No category is open to begin with: the overview is the landing view.
  const [selectedKey, setSelectedKey] = useState<CategoryKey | undefined>(undefined);
  const selected = categories.find((category) => category.key === selectedKey);

  const healthyCount = [...report.fair, ...report.strong].filter(
    (entry) => !expiredIds.has(entry.id.toString()),
  ).length;
  // Entries that sign in some other way have nothing to rate, so they count
  // neither for nor against the vault's health.
  const unratedCount = report.noPassword.length;
  const passwordCount = entries.length - unratedCount;

  return (
    <div className="detail-pane">
      <div className="detail-content">
        <h1 className="detail-title">Password Health</h1>

        {entries.length === 0 ? (
          <div className="detail-card padded">No entries to check yet.</div>
        ) : (
          <>
            <p className="health-summary">
              {healthyCount} of {passwordCount} passwords are healthy.
              {unratedCount > 0 &&
                ` ${unratedCount} ${
                  unratedCount === 1 ? "entry has" : "entries have"
                } no password and ${unratedCount === 1 ? "isn't" : "aren't"} rated.`}
            </p>

            <div className="health-stats">
              <button
                type="button"
                className={`health-stat-card accent${selectedKey === undefined ? " selected" : ""}`}
                aria-pressed={selectedKey === undefined}
                onClick={() => setSelectedKey(undefined)}
              >
                <div className="health-stat-number accent">
                  {percentage(healthyCount, passwordCount)}%
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
                passwordCount={passwordCount}
                healthyCount={healthyCount}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
