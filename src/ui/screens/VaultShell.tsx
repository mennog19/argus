import { useRef, useState } from "react";
import { Entry, EntryId, Group, GroupId, PasswordPolicyOptions, Vault } from "../../domain";
import { ClipboardWriter } from "../../application/clipboard";
import { UrlOpener } from "../../application/url-opener";
import {
  CopyIcon,
  EditIcon,
  GeneratorIcon,
  HealthIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
  VaultIcon,
  XIcon,
} from "../icons";
import { initialOf } from "../format";
import {
  collectAllEntries,
  entriesOf,
  EntryWithGroup,
  flattenGroupOptions,
  searchEntries,
} from "../vault-browsing";
import { EntryForm } from "./EntryForm";
import { GeneratorScreen } from "./GeneratorScreen";
import { GroupTree } from "./GroupTree";
import { HealthScreen } from "./HealthScreen";
import { RecycleBinPanel } from "./RecycleBinPanel";
import { SettingsScreen } from "./SettingsScreen";

interface VaultShellProps {
  vault: Vault;
  urlOpener: UrlOpener;
  clipboardWriter: ClipboardWriter;
  generatorPolicy: PasswordPolicyOptions;
  clipboardClearSeconds: number;
  onLock: () => void;
  onSave: (vault: Vault) => Promise<void>;
  onGeneratorPolicyChange: (policy: PasswordPolicyOptions) => void;
  onClipboardClearSecondsChange: (seconds: number) => void;
  getPasswordChangedTimes: () => Map<string, Date>;
}

const ALL_ITEMS = "__all__";

type FormMode = { kind: "none" } | { kind: "create" } | { kind: "edit" };
type View = "vault" | "generator" | "health" | "settings";

export function VaultShell({
  vault,
  urlOpener,
  clipboardWriter,
  generatorPolicy,
  clipboardClearSeconds,
  onLock,
  onSave,
  onGeneratorPolicyChange,
  onClipboardClearSecondsChange,
  getPasswordChangedTimes,
}: VaultShellProps) {
  const [view, setView] = useState<View>("vault");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_ITEMS);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "none" });
  const [searchQuery, setSearchQuery] = useState("");

  const rootGroup = vault.rootGroup;
  const recycleBin = vault.recycleBin;
  const excludeFromBrowsing = recycleBin ? [recycleBin.id] : [];

  // Falls back to "All Items" if the selected group no longer exists (e.g.
  // it, or an ancestor of it, was just deleted).
  const effectiveGroupId =
    selectedGroupId === ALL_ITEMS || vault.findGroup(GroupId.fromString(selectedGroupId))
      ? selectedGroupId
      : ALL_ITEMS;
  const isRecycleBinSelected =
    recycleBin !== undefined && effectiveGroupId === recycleBin.id.toString();
  const selectedGroup =
    effectiveGroupId === ALL_ITEMS
      ? undefined
      : vault.findGroup(GroupId.fromString(effectiveGroupId));

  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery !== "";

  const visibleEntries: EntryWithGroup[] = isRecycleBinSelected
    ? []
    : isSearching
      ? searchEntries(collectAllEntries(rootGroup, excludeFromBrowsing), trimmedQuery)
      : effectiveGroupId === ALL_ITEMS
        ? collectAllEntries(rootGroup, excludeFromBrowsing)
        : entriesOf(selectedGroup!);

  const selected = visibleEntries.find((item) => item.entry.id.toString() === selectedEntryId);
  const groupOptions = flattenGroupOptions(rootGroup, excludeFromBrowsing);

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setSelectedEntryId(undefined);
    setRevealed(false);
    setFormMode({ kind: "none" });
    setSearchQuery("");
  }

  function selectEntry(entryId: string) {
    setSelectedEntryId(entryId);
    setRevealed(false);
    setFormMode({ kind: "none" });
  }

  function handleSelectHealthEntry(entry: Entry, group: Group) {
    selectGroup(group.id.toString());
    selectEntry(entry.id.toString());
    setView("vault");
  }

  async function persist(nextVault: Vault): Promise<void> {
    await onSave(nextVault);
  }

  async function handleCreateGroup(parentId: GroupId, name: string) {
    await persist(vault.addGroup(parentId, Group.create(name)));
  }

  async function handleRenameGroup(groupId: GroupId, name: string) {
    await persist(vault.renameGroup(groupId, name));
  }

  async function handleDeleteGroup(groupId: GroupId) {
    await persist(vault.deleteGroup(groupId));
    if (effectiveGroupId === groupId.toString()) {
      selectGroup(ALL_ITEMS);
    }
  }

  async function handleCreateEntry(entry: Entry, groupId: GroupId) {
    await persist(vault.addEntry(groupId, entry));
    setFormMode({ kind: "none" });
    setSelectedEntryId(entry.id.toString());
  }

  async function handleUpdateEntry(entry: Entry, targetGroupId: GroupId, currentGroupId: GroupId) {
    let next = vault.updateEntry(entry);
    if (!currentGroupId.equals(targetGroupId)) {
      next = next.removeEntry(entry.id).addEntry(targetGroupId, entry);
    }
    await persist(next);
    setFormMode({ kind: "none" });
  }

  async function handleDeleteEntry(entryId: EntryId) {
    await persist(vault.deleteEntry(entryId));
    setSelectedEntryId(undefined);
  }

  async function handleRestoreEntry(entryId: EntryId) {
    await persist(vault.restoreEntry(entryId, vault.rootGroup.id));
  }

  async function handleDeleteEntryForever(entryId: EntryId) {
    await persist(vault.removeEntry(entryId));
  }

  async function handleRestoreGroup(groupId: GroupId) {
    await persist(vault.restoreGroup(groupId, vault.rootGroup.id));
  }

  async function handleDeleteGroupForever(groupId: GroupId) {
    await persist(vault.removeGroup(groupId));
  }

  async function handleEmptyRecycleBin() {
    await persist(vault.emptyRecycleBin());
  }

  function startCreateEntry() {
    setSelectedEntryId(undefined);
    setFormMode({ kind: "create" });
  }

  const newEntryGroupId =
    effectiveGroupId === ALL_ITEMS ? rootGroup.id.toString() : effectiveGroupId;

  return (
    <div className="vault-shell">
      <nav className="nav-rail">
        <div className="nav-logo">A</div>
        <div className="nav-rail-icons">
          <button
            type="button"
            className={`icon-button${view === "vault" ? " active" : ""}`}
            aria-label="Vault"
            onClick={() => setView("vault")}
          >
            <VaultIcon />
          </button>
          <button
            type="button"
            className={`icon-button${view === "generator" ? " active" : ""}`}
            aria-label="Password generator"
            onClick={() => setView("generator")}
          >
            <GeneratorIcon />
          </button>
          <button
            type="button"
            className={`icon-button${view === "health" ? " active" : ""}`}
            aria-label="Password health"
            onClick={() => setView("health")}
          >
            <HealthIcon />
          </button>
          <button
            type="button"
            className={`icon-button${view === "settings" ? " active" : ""}`}
            aria-label="Settings"
            onClick={() => setView("settings")}
          >
            <SettingsIcon />
          </button>
        </div>
        <button type="button" className="icon-button" onClick={onLock} aria-label="Lock vault">
          <LockIcon />
        </button>
      </nav>

      {view === "generator" ? (
        <GeneratorScreen policyOptions={generatorPolicy} onPolicyChange={onGeneratorPolicyChange} />
      ) : view === "health" ? (
        <HealthScreen
          entries={collectAllEntries(rootGroup, excludeFromBrowsing)}
          passwordChangedTimes={getPasswordChangedTimes()}
          onSelectEntry={handleSelectHealthEntry}
        />
      ) : view === "settings" ? (
        <SettingsScreen
          clipboardClearSeconds={clipboardClearSeconds}
          onClipboardClearSecondsChange={onClipboardClearSecondsChange}
        />
      ) : (
        <>
          <GroupTree
            rootGroup={rootGroup}
            recycleBin={recycleBin}
            selectedGroupId={effectiveGroupId}
            allItemsId={ALL_ITEMS}
            allItemsCount={collectAllEntries(rootGroup, excludeFromBrowsing).length}
            onSelect={selectGroup}
            onCreateGroup={handleCreateGroup}
            onRenameGroup={handleRenameGroup}
            onDeleteGroup={handleDeleteGroup}
          />

          {isRecycleBinSelected && recycleBin ? (
            <RecycleBinPanel
              binGroup={recycleBin}
              onRestoreEntry={handleRestoreEntry}
              onDeleteEntryForever={handleDeleteEntryForever}
              onRestoreGroup={handleRestoreGroup}
              onDeleteGroupForever={handleDeleteGroupForever}
              onEmptyRecycleBin={handleEmptyRecycleBin}
            />
          ) : (
            <>
              <div className="entry-list-panel">
                <div className="entry-list-header">
                  <h2>{effectiveGroupId === ALL_ITEMS ? "All Items" : selectedGroup?.name}</h2>
                  <button type="button" className="btn-secondary" onClick={startCreateEntry}>
                    <PlusIcon size={13} /> New Entry
                  </button>
                </div>
                <div className="entry-search">
                  <SearchIcon size={14} />
                  <input
                    type="text"
                    className="entry-search-input"
                    placeholder="Search entries…"
                    aria-label="Search entries"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  {isSearching && (
                    <button
                      type="button"
                      className="entry-search-clear"
                      aria-label="Clear search"
                      onClick={() => setSearchQuery("")}
                    >
                      <XIcon size={12} />
                    </button>
                  )}
                </div>
                <div className="entry-list">
                  {visibleEntries.length === 0 && (
                    <div className="entry-list-empty">
                      {isSearching ? `No entries match "${trimmedQuery}".` : "No entries in this group."}
                    </div>
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
                {formMode.kind === "create" && (
                  <EntryForm
                    initialGroupId={newEntryGroupId}
                    groupOptions={groupOptions}
                    generatorPolicy={generatorPolicy}
                    onSubmit={handleCreateEntry}
                    onCancel={() => setFormMode({ kind: "none" })}
                  />
                )}
                {formMode.kind === "edit" && selected && (
                  <EntryForm
                    initialEntry={selected.entry}
                    initialGroupId={selected.group.id.toString()}
                    groupOptions={groupOptions}
                    generatorPolicy={generatorPolicy}
                    onSubmit={(entry, groupId) => handleUpdateEntry(entry, groupId, selected.group.id)}
                    onCancel={() => setFormMode({ kind: "none" })}
                  />
                )}
                {formMode.kind === "none" && !selected && (
                  <div className="detail-empty">Select an entry to view details</div>
                )}
                {formMode.kind === "none" && selected && (
                  <EntryDetail
                    entryWithGroup={selected}
                    urlOpener={urlOpener}
                    clipboardWriter={clipboardWriter}
                    clipboardClearSeconds={clipboardClearSeconds}
                    revealed={revealed}
                    onToggleReveal={() => setRevealed((value) => !value)}
                    onEdit={() => setFormMode({ kind: "edit" })}
                    onDelete={() => handleDeleteEntry(selected.entry.id)}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

interface EntryDetailProps {
  entryWithGroup: EntryWithGroup;
  urlOpener: UrlOpener;
  clipboardWriter: ClipboardWriter;
  clipboardClearSeconds: number;
  revealed: boolean;
  onToggleReveal: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

type CopiedField = "username" | "password" | undefined;

function EntryDetail({
  entryWithGroup,
  urlOpener,
  clipboardWriter,
  clipboardClearSeconds,
  revealed,
  onToggleReveal,
  onEdit,
  onDelete,
}: EntryDetailProps) {
  const { entry, group } = entryWithGroup;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [copiedField, setCopiedField] = useState<CopiedField>(undefined);
  const copyToken = useRef(0);

  async function handleCopy(value: string, field: "username" | "password") {
    copyToken.current += 1;
    const thisToken = copyToken.current;
    await clipboardWriter.writeText(value);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField((current) => (current === field ? undefined : current));
    }, 1500);
    setTimeout(() => {
      if (copyToken.current === thisToken) {
        void clipboardWriter.writeText("");
      }
    }, clipboardClearSeconds * 1000);
  }

  async function handleConfirmDelete() {
    setBusy(true);
    setError(undefined);
    try {
      await onDelete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete entry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail-content">
      <div className="detail-header">
        <div className="detail-avatar">{initialOf(entry.title)}</div>
        <div className="entry-row-text">
          <h1 className="detail-title">{entry.title || "(untitled)"}</h1>
          {entry.url && (
            <button
              type="button"
              className="link-muted"
              onClick={() => void urlOpener.open(entry.url)}
            >
              {entry.url}
            </button>
          )}
        </div>
        <div className="detail-header-actions">
          <button type="button" className="icon-button" aria-label="Edit entry" onClick={onEdit}>
            <EditIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Delete entry"
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="group-inline-confirm">
          <span>Delete this entry?</span>
          <button
            type="button"
            className="link-muted"
            onClick={() => void handleConfirmDelete()}
            disabled={busy}
          >
            Delete
          </button>
          <button
            type="button"
            className="link-muted"
            onClick={() => setConfirmingDelete(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <div className="field-error">{error}</div>}

      <div className="detail-cards">
        <div className="detail-card">
          <div className="detail-field-row">
            <div>
              <div className="field-label">Username</div>
              <div className="detail-field-value">{entry.username}</div>
            </div>
            <div className="detail-field-actions">
              {copiedField === "username" && <span className="copied-label">Copied</span>}
              <button
                type="button"
                className="icon-button-small"
                aria-label="Copy username"
                onClick={() => void handleCopy(entry.username, "username")}
              >
                <CopyIcon size={14} />
              </button>
            </div>
          </div>
          <div className="detail-field-row">
            <div>
              <div className="field-label">Password</div>
              <div className="detail-field-value masked">
                {revealed ? entry.password.reveal() : entry.password.toString()}
              </div>
            </div>
            <div className="detail-field-actions">
              {copiedField === "password" && <span className="copied-label">Copied</span>}
              <button
                type="button"
                className="icon-button-small"
                aria-label="Copy password"
                onClick={() => void handleCopy(entry.password.reveal(), "password")}
              >
                <CopyIcon size={14} />
              </button>
              <button type="button" onClick={onToggleReveal}>
                {revealed ? "Hide" : "Show"}
              </button>
            </div>
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

        {entry.customFields.values.length > 0 && (
          <div className="detail-card padded">
            <div className="field-label">Custom fields</div>
            {entry.customFields.values.map((field) => (
              <div className="detail-meta-row" key={field.key}>
                <span>{field.key}</span>
                <span>{field.isProtected ? "••••••••" : field.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
