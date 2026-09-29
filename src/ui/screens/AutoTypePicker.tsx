import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { AutoTypeRequest } from "../../application/auto-type-service";
import { autoTypeHost, Entry } from "../../domain";
import { EntryAvatar } from "../entry-icons/EntryAvatar";

/**
 * The warning, if any, a request deserves before anyone picks from it:
 * either the page's title contradicts its address, or the address couldn't
 * be read and everything shown rests on a title the page chose itself.
 */
function addressWarning({ window: target, titleMismatches }: AutoTypeRequest): string | undefined {
  if (target.url !== undefined && titleMismatches.length > 0) {
    const named = titleMismatches.map((entry) => entry.title || "(untitled)").join(", ");
    return (
      `This page's title points at ${named}, but its address is ` +
      `${autoTypeHost(target.url) || "something else"}. It may be a fake sign-in page, ` +
      "so those entries aren't offered here."
    );
  }
  if (target.isBrowser && target.url === undefined) {
    return (
      "Argus couldn't read this browser's address bar, so these matches come from the page's " +
      "title, which any page can set. Check the address before you pick."
    );
  }
  return undefined;
}

interface AutoTypePickerProps {
  request: AutoTypeRequest;
  onTypeInto: (entry: Entry) => void;
  onCancel: () => void;
}

/**
 * Confirms where an auto-type press is about to send keystrokes, and whose
 * credentials it will send.
 *
 * A window title is a weak identifier — "Sign in" could be anything — so the
 * target is always named in full and a person always picks, even when only
 * one entry matched. Arrow keys and Enter make that a single keystroke in the
 * common case, which is as far as this can be shortened without typing a
 * password into a window nobody looked at.
 */
export function AutoTypePicker({ request, onTypeInto, onCancel }: AutoTypePickerProps) {
  const { window: target, matches } = request;
  const warning = addressWarning(request);
  const address = target.url === undefined ? "" : autoTypeHost(target.url);
  const [selected, setSelected] = useState(0);
  const [shown, setShown] = useState(request);
  const listRef = useRef<HTMLUListElement>(null);

  // A second hotkey press captures a different window, so the highlight falls
  // back to the top of the new list rather than an index into the old one.
  // Adjusted during render rather than in an effect: React re-renders this
  // component before committing, so the stale index is never painted.
  if (shown !== request) {
    setShown(request);
    setSelected(0);
  }

  // `current` is null when nothing matched and the list isn't rendered.
  useEffect(() => {
    listRef.current?.focus();
  }, [request]);

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((current) => (current + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((current) => (current - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onTypeInto(matches[selected].entry);
    } else if (event.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-card auto-type-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-type-title"
      >
        <h2 id="auto-type-title">Auto-type</h2>
        <p className="auto-type-target">
          Keystrokes will go to <strong>{target.title || "an untitled window"}</strong>
          {target.processName !== "" && (
            <span className="auto-type-process"> · {target.processName}</span>
          )}
        </p>
        {address !== "" && (
          <p className="auto-type-address">
            Address: <strong>{address}</strong>
          </p>
        )}
        {warning && (
          <p className="auto-type-warning" role="alert">
            {warning}
          </p>
        )}

        {matches.length === 0 ? (
          <p className="auto-type-empty">
            Nothing in this vault matches that window. Put its address in an entry&rsquo;s URL field
            to make it match next time.
          </p>
        ) : (
          <ul
            className="auto-type-matches"
            ref={listRef}
            tabIndex={0}
            role="listbox"
            aria-label="Entries matching that window"
            aria-activedescendant={`auto-type-match-${selected}`}
            onKeyDown={handleKeyDown}
          >
            {matches.map(({ entry, verified }, index) => (
              <li
                key={entry.id.toString()}
                id={`auto-type-match-${index}`}
                role="option"
                aria-selected={index === selected}
                className={
                  index === selected
                    ? "auto-type-match auto-type-match-selected"
                    : "auto-type-match"
                }
                onClick={() => onTypeInto(entry)}
              >
                <EntryAvatar entry={entry} size="sm" />
                <span className="auto-type-match-text">
                  <span className="auto-type-match-title">{entry.title}</span>
                  <span className="auto-type-match-username">
                    {entry.username || "no username"}
                  </span>
                </span>
                {/* Only a browser has an address to check against; for any
                    other app a title match is all there ever is. */}
                {target.isBrowser && (
                  <span
                    className={verified ? "auto-type-match-badge" : "auto-type-match-badge weak"}
                  >
                    {verified ? "Address match" : "Title only"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
