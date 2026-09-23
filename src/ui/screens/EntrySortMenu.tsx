import { CSSProperties, MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { EntrySortId } from "../../application/settings";
import { CheckIcon, ListIcon, SortAscIcon, SortIcon } from "../icons";
import { ENTRY_SORT_OPTIONS, EntrySortDirection } from "../entry-sort";

const MENU_WIDTH = 216;
const VIEWPORT_GUTTER = 8;

interface EntrySortMenuProps {
  value: EntrySortId;
  onChange: (sort: EntrySortId) => void;
}

interface Anchor {
  readonly right: number;
  readonly bottom: number;
}

function directionGlyph(direction: EntrySortDirection) {
  switch (direction) {
    case "none":
      return <ListIcon size={14} />;
    case "asc":
      return <SortAscIcon size={14} />;
    case "desc":
      return <SortIcon size={14} />;
  }
}

/** Hangs the menu off the trigger's right edge, clamped inside the viewport. */
function menuStyle(anchor: Anchor): CSSProperties {
  const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER;
  return {
    left: Math.max(VIEWPORT_GUTTER, Math.min(anchor.right - MENU_WIDTH, maxLeft)),
    top: anchor.bottom + 6,
    width: MENU_WIDTH,
  };
}

/**
 * The entry list's sort control: a glyph tucked into the right of the search
 * bar, opening a menu of orders. The trigger lights up in the accent color
 * whenever the list *isn't* in vault order, so a sorted list never looks like
 * an unsorted one.
 */
export function EntrySortMenu({ value, onChange }: EntrySortMenuProps) {
  const [anchor, setAnchor] = useState<Anchor | undefined>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);

  // Closes on an outside click or Escape. A click on the trigger itself is
  // left alone, so its own handler can toggle the menu shut.
  useEffect(() => {
    if (!anchor) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest("[data-entry-sort-trigger]")) {
        return;
      }
      setAnchor(undefined);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAnchor(undefined);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchor]);

  function toggle(event: ReactMouseEvent<HTMLButtonElement>) {
    if (anchor) {
      setAnchor(undefined);
      return;
    }
    const { right, bottom } = event.currentTarget.getBoundingClientRect();
    setAnchor({ right, bottom });
  }

  const active = ENTRY_SORT_OPTIONS.find((option) => option.id === value);
  const isSorted = value !== "manual";

  return (
    <>
      <button
        type="button"
        data-entry-sort-trigger
        className={`entry-sort-trigger${isSorted ? " sorted" : ""}`}
        aria-label={`Sort entries (${active?.label})`}
        aria-haspopup="menu"
        aria-expanded={anchor !== undefined}
        onClick={toggle}
      >
        <SortIcon size={15} />
      </button>

      {anchor && (
        <div ref={menuRef} className="entry-sort-menu" role="menu" style={menuStyle(anchor)}>
          <div className="entry-sort-menu-label">Sort by</div>
          {ENTRY_SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === value}
              className={`entry-sort-menu-item${option.id === value ? " selected" : ""}`}
              onClick={() => {
                setAnchor(undefined);
                onChange(option.id);
              }}
            >
              {directionGlyph(option.direction)}
              <span className="entry-sort-menu-item-label">{option.label}</span>
              {option.id === value && <CheckIcon size={13} />}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
