import { KeyboardEvent, useState } from "react";
import { formatHotkey, hotkeyFromKeyPress } from "../hotkey-capture";

interface HotkeyFieldProps {
  id: string;
  /** The current accelerator, e.g. `"Control+Shift+A"`. */
  value: string;
  onChange: (accelerator: string) => void;
}

/**
 * A hotkey shown as plain text. Clicking it starts recording: press the
 * combination, then Enter to keep it (Escape, or clicking away, discards it).
 * Nothing is reported until Enter, so a half-typed combination can never
 * reach the OS as a registration attempt.
 */
export function HotkeyField({ id, value, onChange }: HotkeyFieldProps) {
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [rejection, setRejection] = useState<string | undefined>(undefined);

  function stopRecording() {
    setRecording(false);
    setPending(undefined);
    setRejection(undefined);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) {
      return;
    }
    // Everything typed while recording belongs to the recording — including
    // Tab, Space, and Alt, which would otherwise move focus or open a menu.
    event.preventDefault();

    const bare = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
    if (bare && event.code === "Escape") {
      stopRecording();
      return;
    }
    if (bare && event.code === "Enter") {
      if (pending !== undefined) {
        onChange(pending);
        stopRecording();
      }
      return;
    }

    const press = hotkeyFromKeyPress(event);
    if (press.kind === "combo") {
      setPending(press.accelerator);
      setRejection(undefined);
    } else if (press.kind === "rejected") {
      setRejection(press.reason);
    }
  }

  return (
    <div className="hotkey-field">
      <button
        id={id}
        type="button"
        className={`hotkey-field-value${recording ? " recording" : ""}`}
        onClick={() => setRecording(true)}
        onKeyDown={handleKeyDown}
        onBlur={stopRecording}
      >
        {recording
          ? pending !== undefined
            ? formatHotkey(pending)
            : "Press a shortcut…"
          : formatHotkey(value)}
      </button>
      {recording && (
        <span className={rejection ? "field-error" : "hotkey-field-hint"}>
          {rejection ?? (pending !== undefined ? "Enter to save · Esc to cancel" : "Esc to cancel")}
        </span>
      )}
    </div>
  );
}
