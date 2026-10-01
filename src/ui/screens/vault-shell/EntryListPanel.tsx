import { KeyboardEvent, useEffect, useRef } from "react";
import { Entry, FieldReferences } from "../../../domain";
import { EntrySortId } from "../../../application/settings";
import { ENTRY_DRAG_TYPE } from "../../entry-drag";
import { EntryAvatar } from "../../entry-icons/EntryAvatar";
import { PlusIcon, SearchIcon, XIcon } from "../../icons";
import { EntryWithGroup } from "../../vault-browsing";
import { EntrySortMenu } from "../EntrySortMenu";

interface EntryListPanelProps {
  heading: string | undefined;
  entries: readonly EntryWithGroup[];
  /** Resolves `{REF:…}` in the title and username each row shows. */
  references: FieldReferences;
  selectedEntryId: string | undefined;
  draggingEntryId: string | undefined;
  searchQuery: string;
  /**
   * Bumped by the shell each time Ctrl+F is pressed. Any value above 0 focuses
   * the search box, on mount too, so pressing it from another view lands the
   * caret in the box that view switches to.
   */
  searchFocusRequest: number;
  onSearchChange: (query: string) => void;
  entrySort: EntrySortId;
  onSortChange: (sort: EntrySortId) => void;
  onCreateEntry: () => void;
  onSelectEntry: (entry: Entry) => void;
  onDragStartEntry: (entryId: string) => void;
  onDragEndEntry: () => void;
}

export function EntryListPanel({
  heading,
  entries,
  references,
  selectedEntryId,
  draggingEntryId,
  searchQuery,
  searchFocusRequest,
  onSearchChange,
  entrySort,
  onSortChange,
  onCreateEntry,
  onSelectEntry,
  onDragStartEntry,
  onDragEndEntry,
}: EntryListPanelProps) {
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery !== "";
  const searchInputRef = useRef<HTMLInputElement>(null);
  const now = new Date();

  useEffect(() => {
    if (searchFocusRequest > 0) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [searchFocusRequest]);

  const listRef = useRef<HTMLDivElement>(null);

  /** Selects the entry `step` rows on from the selected one, or the nearest end of the list when none is. */
  function selectNeighbour(step: 1 | -1) {
    if (entries.length === 0) {
      return;
    }
    const current = entries.findIndex(({ entry }) => entry.id.toString() === selectedEntryId);
    const start = step === 1 ? -1 : entries.length;
    const target = Math.min(
      Math.max((current === -1 ? start : current) + step, 0),
      entries.length - 1,
    );
    onSelectEntry(entries[target].entry);
    // Rows are rendered in the order of `entries`. Focus follows the
    // selection, which also scrolls the row into view.
    listRef.current?.querySelectorAll<HTMLButtonElement>(".entry-row").item(target).focus();
  }

  function handleArrowKeys(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selectNeighbour(event.key === "ArrowDown" ? 1 : -1);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onSearchChange("");
    } else if (event.key === "Enter" && entries.length > 0) {
      onSelectEntry(entries[0].entry);
    } else {
      handleArrowKeys(event);
    }
  }

  return (
    <div className="entry-list-panel">
      <div className="entry-list-header">
        <h2>{heading}</h2>
        <button type="button" className="btn-secondary" onClick={onCreateEntry}>
          <PlusIcon size={13} /> New Entry
        </button>
      </div>
      <div className="entry-search">
        <SearchIcon size={14} />
        <input
          ref={searchInputRef}
          type="text"
          className="entry-search-input"
          placeholder="Search entries…"
          aria-label="Search entries"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {isSearching && (
          <button
            type="button"
            className="entry-search-clear"
            aria-label="Clear search"
            onClick={() => onSearchChange("")}
          >
            <XIcon size={12} />
          </button>
        )}
        <EntrySortMenu value={entrySort} onChange={onSortChange} />
      </div>
      <div className="entry-list" ref={listRef}>
        {entries.length === 0 && (
          <div className="entry-list-empty">
            {isSearching ? `No entries match "${trimmedQuery}".` : "No entries in this group."}
          </div>
        )}
        {entries.map(({ entry }) => {
          const id = entry.id.toString();
          const expired = entry.isExpired(now);
          return (
            <button
              key={id}
              type="button"
              className={`entry-row${id === selectedEntryId ? " active" : ""}${
                id === draggingEntryId ? " dragging" : ""
              }`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(ENTRY_DRAG_TYPE, id);
                event.dataTransfer.effectAllowed = "move";
                onDragStartEntry(id);
              }}
              onDragEnd={onDragEndEntry}
              onClick={() => onSelectEntry(entry)}
              onKeyDown={handleArrowKeys}
            >
              <EntryAvatar entry={entry} />
              <div className="entry-row-text">
                <div className="entry-row-title-line">
                  <div className="entry-row-title">
                    {references.resolve(entry.title) || "(untitled)"}
                  </div>
                  {expired && <span className="expired-badge">Expired</span>}
                </div>
                <div className="entry-row-username">{references.resolve(entry.username)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
