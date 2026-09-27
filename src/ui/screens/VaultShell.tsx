import { useMemo, useState } from "react";
import { Entry, EntryId, Group, GroupId, Vault } from "../../domain";
import { DEFAULT_ENTRY_FIELD_VISIBILITY, EffectiveSettings } from "../../application/settings";
import { VaultFileInfo } from "../../application/vault-access-service";
import { VaultMergeSource } from "../../application/vault-merge-source";
import { ClipboardWriter } from "../../application/clipboard";
import { UrlOpener } from "../../application/url-opener";
import { useClipboardCopy } from "../use-clipboard-copy";
import { sortEntries } from "../entry-sort";
import { vaultCommands } from "../vault-commands";
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
import { MergeUnlockDialog } from "./MergeUnlockDialog";
import { MergeWizardScreen } from "./MergeWizardScreen";
import { RecycleBinPanel } from "./RecycleBinPanel";
import { SettingsScreen } from "./SettingsScreen";
import { SettingChangeHandler } from "../setting-change";
import { EntryDetail } from "./vault-shell/EntryDetail";
import { EntryListPanel } from "./vault-shell/EntryListPanel";
import { NavRail, ShellView } from "./vault-shell/NavRail";
import { useMergeFlow } from "./vault-shell/use-merge-flow";

interface VaultShellProps {
  vault: Vault;
  filePath: string;
  fileInfo: VaultFileInfo | undefined;
  urlOpener: UrlOpener;
  clipboardWriter: ClipboardWriter;
  mergeSource: VaultMergeSource;
  /**
   * Passed whole rather than one prop per setting. The shell reads a few of
   * these itself and forwards the rest to the settings screen; enumerating
   * them here meant every new setting changed this file twice — once for the
   * value, once for its setter — without the shell ever caring what it was.
   */
  settings: EffectiveSettings;
  onSettingChange: SettingChangeHandler;
  onLock: () => void;
  onSave: (vault: Vault) => Promise<void>;
  onChangeMasterPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onExportSettings: () => Promise<string | undefined>;
  onImportSettings: () => Promise<string | undefined>;
  /** Replaces the in-memory vault without writing the file — used for the
   * "entry was opened" stamp, which must not cost a full re-encrypt per click. */
  onVaultChange: (vault: Vault) => void;
}

const ALL_ITEMS = "__all__";

type FormMode = "none" | "create" | "edit";

export function VaultShell({
  vault,
  filePath,
  fileInfo,
  urlOpener,
  clipboardWriter,
  mergeSource,
  settings,
  onSettingChange,
  onLock,
  onSave,
  onChangeMasterPassword,
  onExportSettings,
  onImportSettings,
  onVaultChange,
}: VaultShellProps) {
  const {
    clipboardClearSeconds,
    entryFieldVisibility,
    entrySort,
    generatorPolicy,
    groupDeleteMode,
  } = settings;
  const [view, setView] = useState<ShellView>("vault");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_ITEMS);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [draggingEntryId, setDraggingEntryId] = useState<string | undefined>(undefined);
  const merge = useMergeFlow(mergeSource, filePath);
  const commands = vaultCommands(vault, onSave);

  // Owned at the shell rather than in the detail pane so a pending clipboard
  // wipe survives the user selecting another entry or opening the editor.
  const clipboard = useClipboardCopy(clipboardWriter, clipboardClearSeconds);

  const rootGroup = vault.rootGroup;
  // Both walk the tree, and both were being recomputed several times per
  // render — the entry list, the health screen, and two sidebar counts each
  // asked for the same walk.
  const recycleBin = useMemo(() => vault.recycleBin, [vault]);
  const excludeFromBrowsing = useMemo(() => (recycleBin ? [recycleBin.id] : []), [recycleBin]);
  const allEntries = useMemo(
    () => collectAllEntries(rootGroup, excludeFromBrowsing),
    [rootGroup, excludeFromBrowsing],
  );

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

  /**
   * What the entry list shows. Written as early returns rather than nested
   * ternaries so the "a group is selected, so it exists" step can narrow
   * `selectedGroup` instead of asserting it away.
   */
  function entriesInScope(): EntryWithGroup[] {
    const trimmedQuery = searchQuery.trim();
    if (isRecycleBinSelected) {
      return [];
    }
    if (trimmedQuery !== "") {
      return searchEntries(allEntries, trimmedQuery);
    }
    return selectedGroup ? entriesOf(selectedGroup) : allEntries;
  }

  const visibleEntries = sortEntries(entriesInScope(), entrySort);
  const selected = visibleEntries.find((item) => item.entry.id.toString() === selectedEntryId);
  const groupOptions = flattenGroupOptions(rootGroup, excludeFromBrowsing).map((option) =>
    option.id === rootGroup.id.toString() ? { ...option, label: "No Group" } : option,
  );
  const newEntryGroupId =
    effectiveGroupId === ALL_ITEMS ? rootGroup.id.toString() : effectiveGroupId;

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setSelectedEntryId(undefined);
    setRevealed(false);
    setFormMode("none");
    setSearchQuery("");
  }

  /**
   * Opening an entry records "opened just now" on it, in memory only — that
   * stamp is what the "recently opened" sort reads. Saving here instead would
   * re-run the KDF and re-encrypt the whole vault on every click, so the stamp
   * rides along with the next save the user's own edits trigger.
   */
  function selectEntry(entry: Entry) {
    setSelectedEntryId(entry.id.toString());
    setRevealed(false);
    setFormMode("none");
    onVaultChange(vault.updateEntry(entry.markAccessed(new Date())));
  }

  function handleSelectHealthEntry(entry: Entry, group: Group) {
    selectGroup(group.id.toString());
    selectEntry(entry);
    setView("vault");
  }

  async function handleDeleteGroup(groupId: GroupId) {
    await commands.deleteGroup(groupId, groupDeleteMode);
    if (effectiveGroupId === groupId.toString()) {
      selectGroup(ALL_ITEMS);
    }
  }

  async function handleCreateEntry(entry: Entry, groupId: GroupId) {
    await commands.createEntry(entry, groupId);
    setFormMode("none");
    setSelectedEntryId(entry.id.toString());
  }

  async function handleUpdateEntry(entry: Entry, targetGroupId: GroupId, currentGroupId: GroupId) {
    await commands.updateEntry(entry, targetGroupId, currentGroupId);
    setFormMode("none");
  }

  async function handleDeleteEntry(entryId: EntryId) {
    await commands.deleteEntry(entryId);
    setSelectedEntryId(undefined);
  }

  function openMergeWizard(sourceVault: Vault) {
    merge.unlocked(sourceVault);
    setView("merge");
  }

  function closeMerge() {
    merge.reset();
    setView("settings");
  }

  /** Leaving via the nav rail abandons any in-progress merge. */
  function goToView(next: ShellView) {
    merge.reset();
    setView(next);
  }

  function startCreateEntry() {
    setSelectedEntryId(undefined);
    setFormMode("create");
  }

  function renderDetailPane() {
    if (formMode === "create") {
      return (
        <EntryForm
          initialGroupId={newEntryGroupId}
          groupOptions={groupOptions}
          generatorPolicy={generatorPolicy}
          fieldVisibility={entryFieldVisibility}
          onSubmit={handleCreateEntry}
          onCancel={() => setFormMode("none")}
        />
      );
    }
    if (!selected) {
      return <div className="detail-empty">Select an entry to view details</div>;
    }
    if (formMode === "edit") {
      return (
        <EntryForm
          initialEntry={selected.entry}
          initialGroupId={selected.group.id.toString()}
          groupOptions={groupOptions}
          generatorPolicy={generatorPolicy}
          fieldVisibility={DEFAULT_ENTRY_FIELD_VISIBILITY}
          onSubmit={(entry, groupId) => handleUpdateEntry(entry, groupId, selected.group.id)}
          onCancel={() => setFormMode("none")}
        />
      );
    }
    return (
      <EntryDetail
        entryWithGroup={selected}
        urlOpener={urlOpener}
        clipboard={clipboard}
        clipboardClearSeconds={clipboardClearSeconds}
        revealed={revealed}
        onToggleReveal={() => setRevealed((value) => !value)}
        onEdit={() => setFormMode("edit")}
        onDelete={() => handleDeleteEntry(selected.entry.id)}
      />
    );
  }

  function renderVaultView() {
    return (
      <>
        <GroupTree
          rootGroup={rootGroup}
          recycleBin={recycleBin}
          selectedGroupId={effectiveGroupId}
          allItemsId={ALL_ITEMS}
          allItemsCount={allEntries.length}
          onSelect={selectGroup}
          onCreateGroup={commands.createGroup}
          onRenameGroup={commands.renameGroup}
          onDeleteGroup={handleDeleteGroup}
          onChangeGroupIcon={commands.changeGroupIcon}
          groupDeleteMode={groupDeleteMode}
          entryDragActive={draggingEntryId !== undefined}
          onDropEntry={(entryId, groupId) =>
            commands.moveEntry(EntryId.fromString(entryId), groupId)
          }
          onMoveGroupToPosition={commands.moveGroupToPosition}
          onMoveGroupToParent={commands.moveGroupToParent}
        />

        {isRecycleBinSelected && recycleBin ? (
          <RecycleBinPanel
            binGroup={recycleBin}
            onRestoreEntry={commands.restoreEntry}
            onDeleteEntryForever={commands.deleteEntryForever}
            onRestoreGroup={commands.restoreGroup}
            onDeleteGroupForever={commands.deleteGroupForever}
            onEmptyRecycleBin={commands.emptyRecycleBin}
          />
        ) : (
          <>
            <EntryListPanel
              heading={effectiveGroupId === ALL_ITEMS ? "All Items" : selectedGroup?.name}
              entries={visibleEntries}
              selectedEntryId={selectedEntryId}
              draggingEntryId={draggingEntryId}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              entrySort={entrySort}
              onSortChange={(sort) => onSettingChange("entrySort", sort)}
              onCreateEntry={startCreateEntry}
              onSelectEntry={selectEntry}
              onDragStartEntry={setDraggingEntryId}
              onDragEndEntry={() => setDraggingEntryId(undefined)}
            />
            <div className="detail-pane">{renderDetailPane()}</div>
          </>
        )}
      </>
    );
  }

  function renderView() {
    if (view === "merge" && merge.filePath !== undefined && merge.sourceVault !== undefined) {
      return (
        <MergeWizardScreen
          vault={vault}
          filePath={merge.filePath}
          sourceVault={merge.sourceVault}
          onApply={onSave}
          onClose={closeMerge}
        />
      );
    }
    switch (view) {
      case "generator":
        return (
          <GeneratorScreen
            policyOptions={generatorPolicy}
            onPolicyChange={(policy) => onSettingChange("generatorPolicy", policy)}
          />
        );
      case "health":
        return <HealthScreen entries={allEntries} onSelectEntry={handleSelectHealthEntry} />;
      case "settings":
        return (
          <SettingsScreen
            filePath={filePath}
            fileInfo={fileInfo}
            entryCount={allEntries.length}
            settings={settings}
            onSettingChange={onSettingChange}
            onChangeMasterPassword={onChangeMasterPassword}
            mergeError={merge.error}
            onOpenMergeWizard={() => void merge.start()}
            onExportSettings={onExportSettings}
            onImportSettings={onImportSettings}
          />
        );
      default:
        return renderVaultView();
    }
  }

  return (
    <>
      <div className="vault-shell">
        <NavRail view={view} onNavigate={goToView} onLock={onLock} />
        {renderView()}
      </div>

      {merge.filePath !== undefined && merge.sourceVault === undefined && (
        <MergeUnlockDialog
          filePath={merge.filePath}
          mergeSource={mergeSource}
          onUnlocked={openMergeWizard}
          onCancel={merge.cancelUnlock}
        />
      )}
    </>
  );
}
