import { useState } from "react";
import { Group, Vault } from "../../domain";
import { UrlOpener } from "../../application/url-opener";
import { LockIcon } from "../icons";
import { initialOf } from "../format";
import { collectAllEntries, entriesOf, EntryWithGroup } from "../vault-browsing";

interface VaultShellProps {
  vault: Vault;
  urlOpener: UrlOpener;
  onLock: () => void;
}

const ALL_ITEMS = "__all__";

export function VaultShell({ vault, urlOpener, onLock }: VaultShellProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_ITEMS);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);

  const rootGroup = vault.rootGroup;
  const childGroups = rootGroup.groups;

  // selectedGroupId is only ever set to ALL_ITEMS or a group id taken from
  // childGroups below, so the lookup always succeeds when it's not ALL_ITEMS.
  const visibleEntries: EntryWithGroup[] =
    selectedGroupId === ALL_ITEMS
      ? collectAllEntries(rootGroup)
      : entriesOf(findGroup(childGroups, selectedGroupId)!);

  const selected = visibleEntries.find((item) => item.entry.id.toString() === selectedEntryId);

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setSelectedEntryId(undefined);
    setRevealed(false);
  }

  function selectEntry(entryId: string) {
    setSelectedEntryId(entryId);
    setRevealed(false);
  }

  return (
    <div className="vault-shell">
      <nav className="nav-rail">
        <div className="nav-logo">A</div>
        <button type="button" className="icon-button" onClick={onLock} aria-label="Lock vault">
          <LockIcon />
        </button>
      </nav>

      <div className="group-sidebar">
        <div className="sidebar-section-label">Vault</div>
        <button
          type="button"
          className={`sidebar-row${selectedGroupId === ALL_ITEMS ? " active" : ""}`}
          onClick={() => selectGroup(ALL_ITEMS)}
        >
          <span>All Items</span>
          <span className="sidebar-row-count">{collectAllEntries(rootGroup).length}</span>
        </button>

        {childGroups.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section-label">Groups</div>
            {childGroups.map((group) => (
              <button
                key={group.id.toString()}
                type="button"
                className={`sidebar-row${selectedGroupId === group.id.toString() ? " active" : ""}`}
                onClick={() => selectGroup(group.id.toString())}
              >
                <span>{group.name}</span>
                <span className="sidebar-row-count">{group.entries.length}</span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="entry-list-panel">
        <div className="entry-list-header">
          <h2>{selectedGroupId === ALL_ITEMS ? "All Items" : findGroup(childGroups, selectedGroupId)?.name}</h2>
        </div>
        <div className="entry-list">
          {visibleEntries.length === 0 && (
            <div className="entry-list-empty">No entries in this group.</div>
          )}
          {visibleEntries.map(({ entry }) => (
            <button
              key={entry.id.toString()}
              type="button"
              className={`entry-row${entry.id.toString() === selectedEntryId ? " active" : ""}`}
              onClick={() => selectEntry(entry.id.toString())}
            >
              <div className="entry-avatar">{initialOf(entry.title)}</div>
              <div className="entry-row-text">
                <div className="entry-row-title">{entry.title || "(untitled)"}</div>
                <div className="entry-row-username">{entry.username}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="detail-pane">
        {!selected && <div className="detail-empty">Select an entry to view details</div>}
        {selected && (
          <EntryDetail entryWithGroup={selected} urlOpener={urlOpener} revealed={revealed} onToggleReveal={() => setRevealed((value) => !value)} />
        )}
      </div>
    </div>
  );
}

function findGroup(groups: readonly Group[], groupId: string): Group | undefined {
  return groups.find((group) => group.id.toString() === groupId);
}

interface EntryDetailProps {
  entryWithGroup: EntryWithGroup;
  urlOpener: UrlOpener;
  revealed: boolean;
  onToggleReveal: () => void;
}

function EntryDetail({ entryWithGroup, urlOpener, revealed, onToggleReveal }: EntryDetailProps) {
  const { entry, group } = entryWithGroup;

  return (
    <div className="detail-content">
      <div className="detail-header">
        <div className="detail-avatar">{initialOf(entry.title)}</div>
        <div className="entry-row-text">
          <h1 className="detail-title">{entry.title || "(untitled)"}</h1>
          {entry.url && (
            <button type="button" className="link-muted" onClick={() => void urlOpener.open(entry.url)}>
              {entry.url}
            </button>
          )}
        </div>
      </div>

      <div className="detail-cards">
        <div className="detail-card">
          <div className="detail-field-row">
            <div>
              <div className="field-label">Username</div>
              <div className="detail-field-value">{entry.username}</div>
            </div>
          </div>
          <div className="detail-field-row">
            <div>
              <div className="field-label">Password</div>
              <div className="detail-field-value masked">
                {revealed ? entry.password.reveal() : entry.password.toString()}
              </div>
            </div>
            <button type="button" onClick={onToggleReveal}>
              {revealed ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="detail-card padded">
          <div className="detail-meta-row">
            <span>Group</span>
            <span>{group.name}</span>
          </div>
        </div>

        {entry.notes && (
          <div className="detail-card padded">
            <div className="field-label">Notes</div>
            <div className="detail-notes">{entry.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
