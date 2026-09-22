import { useMemo, useRef, useState } from "react";
import {
  Entry,
  EntryId,
  Group,
  GroupId,
  Icon,
  PasswordPolicyOptions,
  TOTP_FIELD_KEYS,
  totpConfigFromCustomFields,
  Vault,
} from "../../domain";
import {
  AccentColor,
  AutoLockSettings,
  DEFAULT_ENTRY_FIELD_VISIBILITY,
  EntryFieldVisibility,
  GroupDeleteMode,
  Theme,
} from "../../application/settings";
import { VaultFileInfo } from "../../application/vault-access-service";
import { ClipboardWriter } from "../../application/clipboard";
import { UrlOpener } from "../../application/url-opener";
import {
  CopyIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
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
import { errorMessage } from "../error-message";
import { ENTRY_DRAG_TYPE } from "../entry-drag";
import { EntryAvatar } from "../entry-icons/EntryAvatar";
import { formatTotpCode } from "../format";
import { useTotpCode } from "../use-totp-code";
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
import { ArgusMark } from "../ArgusMark";

interface VaultShellProps {
  vault: Vault;
  filePath: string;
  fileInfo: VaultFileInfo | undefined;
  urlOpener: UrlOpener;
  clipboardWriter: ClipboardWriter;
  generatorPolicy: PasswordPolicyOptions;
  clipboardClearSeconds: number;
  autoLock: AutoLockSettings;
  groupDeleteMode: GroupDeleteMode;
  accentColor: AccentColor;
  theme: Theme;
  contentProtection: boolean;
  entryFieldVisibility: EntryFieldVisibility;
  onLock: () => void;
  onSave: (vault: Vault) => Promise<void>;
  onChangeMasterPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onGeneratorPolicyChange: (policy: PasswordPolicyOptions) => void;
  onClipboardClearSecondsChange: (seconds: number) => void;
  onAutoLockChange: (autoLock: AutoLockSettings) => void;
  onGroupDeleteModeChange: (mode: GroupDeleteMode) => void;
  onAccentColorChange: (accentColor: AccentColor) => void;
  onThemeChange: (theme: Theme) => void;
  onContentProtectionChange: (contentProtection: boolean) => void;
  onEntryFieldVisibilityChange: (visibility: EntryFieldVisibility) => void;
}

const ALL_ITEMS = "__all__";

type FormMode = { kind: "none" } | { kind: "create" } | { kind: "edit" };
type View = "vault" | "generator" | "health" | "settings";

export function VaultShell({
  vault,
  filePath,
  fileInfo,
  urlOpener,
  clipboardWriter,
  generatorPolicy,
  clipboardClearSeconds,
  autoLock,
  groupDeleteMode,
  accentColor,
  theme,
  contentProtection,
  entryFieldVisibility,
  onLock,
  onSave,
  onChangeMasterPassword,
  onGeneratorPolicyChange,
  onClipboardClearSecondsChange,
  onAutoLockChange,
  onGroupDeleteModeChange,
  onAccentColorChange,
  onThemeChange,
  onContentProtectionChange,
  onEntryFieldVisibilityChange,
}: VaultShellProps) {
  const [view, setView] = useState<View>("vault");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_ITEMS);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "none" });
  const [searchQuery, setSearchQuery] = useState("");
  const [draggingEntryId, setDraggingEntryId] = useState<string | undefined>(undefined);

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
  const groupOptions = flattenGroupOptions(rootGroup, excludeFromBrowsing).map((option) =>
    option.id === rootGroup.id.toString() ? { ...option, label: "No Group" } : option,
  );

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

  async function handleChangeGroupIcon(groupId: GroupId, icon: Icon) {
    await persist(vault.changeGroupIcon(groupId, icon));
  }

  async function handleReorderGroup(groupId: GroupId, beforeId: GroupId | undefined) {
    await persist(vault.reorderGroup(groupId, beforeId));
  }

  async function handleDeleteGroup(groupId: GroupId) {
    await persist(
      groupDeleteMode === "keepContents"
        ? vault.deleteGroupKeepingContents(groupId)
        : vault.deleteGroup(groupId),
    );
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

  async function handleDropEntry(entryId: string, groupId: GroupId) {
    const next = vault.moveEntry(EntryId.fromString(entryId), groupId);
    if (next !== vault) {
      await persist(next);
    }
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
        <div className="nav-logo">
          <ArgusMark />
        </div>
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
          onSelectEntry={handleSelectHealthEntry}
        />
      ) : view === "settings" ? (
        <SettingsScreen
          filePath={filePath}
          fileInfo={fileInfo}
          entryCount={collectAllEntries(rootGroup, excludeFromBrowsing).length}
          clipboardClearSeconds={clipboardClearSeconds}
          autoLock={autoLock}
          groupDeleteMode={groupDeleteMode}
          accentColor={accentColor}
          theme={theme}
          contentProtection={contentProtection}
          entryFieldVisibility={entryFieldVisibility}
          onChangeMasterPassword={onChangeMasterPassword}
          onClipboardClearSecondsChange={onClipboardClearSecondsChange}
          onAutoLockChange={onAutoLockChange}
          onGroupDeleteModeChange={onGroupDeleteModeChange}
          onAccentColorChange={onAccentColorChange}
          onThemeChange={onThemeChange}
          onContentProtectionChange={onContentProtectionChange}
          onEntryFieldVisibilityChange={onEntryFieldVisibilityChange}
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
            onChangeGroupIcon={handleChangeGroupIcon}
            groupDeleteMode={groupDeleteMode}
            entryDragActive={draggingEntryId !== undefined}
            onDropEntry={handleDropEntry}
            onReorderGroup={handleReorderGroup}
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
                      {isSearching
                        ? `No entries match "${trimmedQuery}".`
                        : "No entries in this group."}
                    </div>
                  )}
                  {visibleEntries.map(({ entry }) => (
                    <button
                      key={entry.id.toString()}
                      type="button"
                      className={`entry-row${entry.id.toString() === selectedEntryId ? " active" : ""}${
                        entry.id.toString() === draggingEntryId ? " dragging" : ""
                      }`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(ENTRY_DRAG_TYPE, entry.id.toString());
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingEntryId(entry.id.toString());
                      }}
                      onDragEnd={() => setDraggingEntryId(undefined)}
                      onClick={() => selectEntry(entry.id.toString())}
                    >
                      <EntryAvatar entry={entry} />
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
                    fieldVisibility={entryFieldVisibility}
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
                    fieldVisibility={DEFAULT_ENTRY_FIELD_VISIBILITY}
                    onSubmit={(entry, groupId) =>
                      handleUpdateEntry(entry, groupId, selected.group.id)
                    }
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

type CopiedField = "username" | "password" | "totp" | undefined;

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
  const totpConfig = useMemo(() => totpConfigFromCustomFields(entry.customFields), [entry]);
  const totpCode = useTotpCode(totpConfig);
  // The raw TOTP fields have their own card above; only hide them from the
  // generic list once they've actually been parsed into a usable config, so
  // a malformed field is still visible somewhere rather than disappearing.
  const otherCustomFields = totpConfig
    ? entry.customFields.values.filter((field) => !TOTP_FIELD_KEYS.has(field.key))
    : entry.customFields.values;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [copiedField, setCopiedField] = useState<CopiedField>(undefined);
  const [clearingField, setClearingField] = useState<CopiedField>(undefined);
  const [clearingToken, setClearingToken] = useState(0);
  const copyToken = useRef(0);

  async function handleCopy(value: string, field: "username" | "password" | "totp") {
    copyToken.current += 1;
    const thisToken = copyToken.current;
    await clipboardWriter.writeText(value);
    setCopiedField(field);
    setClearingField(field);
    setClearingToken(thisToken);
    setTimeout(() => {
      setCopiedField((current) => (current === field ? undefined : current));
    }, 1500);
    setTimeout(() => {
      if (copyToken.current === thisToken) {
        void clipboardWriter.writeText("");
      }
      setClearingField((current) => (current === field ? undefined : current));
    }, clipboardClearSeconds * 1000);
  }

  async function handleConfirmDelete() {
    setBusy(true);
    setError(undefined);
    try {
      await onDelete();
    } catch (cause) {
      setError(errorMessage(cause, "Failed to delete entry."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail-content">
      <div className="detail-header">
        <EntryAvatar entry={entry} size="lg" />
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
            <EditIcon size={18} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Delete entry"
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon size={18} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="group-inline-confirm">
          <span>Delete this entry?</span>
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={() => setConfirmingDelete(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger-sm"
            onClick={() => void handleConfirmDelete()}
            disabled={busy}
          >
            Delete
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
                <CopyIcon size={17} strokeWidth={2.25} />
              </button>
            </div>
            {clearingField === "username" && (
              <ClipboardClearBar key={clearingToken} seconds={clipboardClearSeconds} />
            )}
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
                <CopyIcon size={17} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                className="icon-button-small"
                aria-label={revealed ? "Hide password" : "Show password"}
                title={revealed ? "Hide password" : "Show password"}
                onClick={onToggleReveal}
              >
                {revealed ? (
                  <EyeOffIcon size={17} strokeWidth={2.25} />
                ) : (
                  <EyeIcon size={17} strokeWidth={2.25} />
                )}
              </button>
            </div>
            {clearingField === "password" && (
              <ClipboardClearBar key={clearingToken} seconds={clipboardClearSeconds} />
            )}
          </div>
        </div>

        {totpConfig && (
          <div className="detail-card">
            <div className="detail-field-row">
              <div>
                <div className="field-label">Authenticator code</div>
                <div className="detail-field-value totp-code-value">
                  {totpCode ? formatTotpCode(totpCode.value) : "···· ··"}
                </div>
              </div>
              <div className="detail-field-actions">
                {copiedField === "totp" && <span className="copied-label">Copied</span>}
                <button
                  type="button"
                  className="icon-button-small"
                  aria-label="Copy authenticator code"
                  disabled={!totpCode}
                  onClick={() => totpCode && void handleCopy(totpCode.value, "totp")}
                >
                  <CopyIcon size={17} strokeWidth={2.25} />
                </button>
              </div>
              <div className="totp-progress-bar" aria-hidden="true">
                <div
                  className="totp-progress-bar-fill"
                  style={{
                    width: totpCode
                      ? `${(totpCode.secondsRemaining / totpConfig.period) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
          </div>
        )}

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

        {otherCustomFields.length > 0 && (
          <div className="detail-card padded">
            <div className="field-label">Custom fields</div>
            {otherCustomFields.map((field) => (
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

function ClipboardClearBar({ seconds }: { seconds: number }) {
  return (
    <div className="clipboard-clear-bar" aria-hidden="true">
      <div className="clipboard-clear-bar-fill" style={{ animationDuration: `${seconds}s` }} />
    </div>
  );
}
