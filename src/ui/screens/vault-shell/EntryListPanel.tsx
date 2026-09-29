import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (searchFocusRequest > 0) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [searchFocusRequest]);

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
      <div className="entry-list">
        {entries.length === 0 && (
          <div className="entry-list-empty">
            {isSearching ? `No entries match "${trimmedQuery}".` : "No entries in this group."}
          </div>
        )}
        {entries.map(({ entry }) => {
          const id = entry.id.toString();
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
            >
              <EntryAvatar entry={entry} />
              <div className="entry-row-text">
                <div className="entry-row-title">
                  {references.resolve(entry.title) || "(untitled)"}
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
