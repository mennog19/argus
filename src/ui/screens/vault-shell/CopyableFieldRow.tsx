import { ReactNode } from "react";
import { CopyIcon } from "../../icons";
import { ClipboardCopy } from "../../use-clipboard-copy";

interface CopyableFieldRowProps {
  /** Identifies this row to the clipboard hook, so only it shows "Copied" and the countdown. */
  field: string;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  copyLabel: string;
  /** What the copy button puts on the clipboard; `undefined` disables it. */
  copyValue: string | undefined;
  clipboard: ClipboardCopy;
  clipboardClearSeconds: number;
  /** Extra buttons after the copy button, e.g. a reveal toggle. */
  actions?: ReactNode;
  /** Shown under the row in place of the clipboard countdown bar. */
  footer?: ReactNode;
}

export function CopyableFieldRow({
  field,
  label,
  value,
  valueClassName,
  copyLabel,
  copyValue,
  clipboard,
  clipboardClearSeconds,
  actions,
  footer,
}: CopyableFieldRowProps) {
  const { copiedField, clearingField, clearingToken, copy } = clipboard;
  return (
    <div className="detail-field-row">
      <div>
        <div className="field-label">{label}</div>
        <div className={`detail-field-value${valueClassName ? ` ${valueClassName}` : ""}`}>
          {value}
        </div>
      </div>
      <div className="detail-field-actions">
        {copiedField === field && <span className="copied-label">Copied</span>}
        <button
          type="button"
          className="icon-button-small"
          aria-label={copyLabel}
          disabled={copyValue === undefined}
          onClick={copyValue === undefined ? undefined : () => void copy(copyValue, field)}
        >
          <CopyIcon size={17} strokeWidth={2.25} />
        </button>
        {actions}
      </div>
      {footer ??
        (clearingField === field && (
          <ClipboardClearBar key={clearingToken} seconds={clipboardClearSeconds} />
        ))}
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
