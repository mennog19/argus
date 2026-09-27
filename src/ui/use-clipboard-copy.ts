import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardWriter } from "../application/clipboard";

/** How long the "Copied" confirmation stays up next to the button. */
const COPIED_LABEL_MS = 1500;

export interface ClipboardCopy {
  /** Which field's "Copied" confirmation is showing, if any. */
  readonly copiedField: string | undefined;
  /** Which field's auto-clear countdown is running, if any. */
  readonly clearingField: string | undefined;
  /** Bumped on every copy, so a restarted countdown replays its animation. */
  readonly clearingToken: number;
  /** Copies `value`, then wipes it again once the countdown runs out. */
  readonly copy: (value: string, field: string) => Promise<void>;
}

/**
 * Copying a secret, with the countdown that wipes it from the clipboard
 * again.
 *
 * The timers belong here rather than in the row that drew the copy button:
 * that row unmounts the moment the user picks another entry or opens the
 * editor, and a pending wipe has to outlive it — otherwise a password stays
 * on the clipboard for good, and the wipe's own `setState` lands on a
 * component that is gone.
 *
 * Unmounting this hook wipes immediately instead of waiting out the
 * countdown. It unmounts when the vault closes, which is exactly the moment
 * a password manager should not be leaving a password behind.
 */
export function useClipboardCopy(writer: ClipboardWriter, clearSeconds: number): ClipboardCopy {
  const [copiedField, setCopiedField] = useState<string | undefined>(undefined);
  const [clearingField, setClearingField] = useState<string | undefined>(undefined);
  const [clearingToken, setClearingToken] = useState(0);

  const labelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wipeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** True while a copied secret is still sitting on the clipboard unwiped. */
  const wipePending = useRef(false);

  // Read through a ref so that a caller passing a fresh writer can't be
  // mistaken for an unmount and wipe the clipboard out from under itself.
  const writerRef = useRef(writer);
  useEffect(() => {
    writerRef.current = writer;
  }, [writer]);

  useEffect(() => {
    return () => {
      clearTimeout(labelTimer.current);
      clearTimeout(wipeTimer.current);
      if (wipePending.current) {
        wipePending.current = false;
        void writerRef.current.writeText("");
      }
    };
  }, []);

  const copy = useCallback(
    async (value: string, field: string) => {
      await writerRef.current.writeText(value);
      wipePending.current = true;
      setCopiedField(field);
      setClearingField(field);
      setClearingToken((current) => current + 1);

      clearTimeout(labelTimer.current);
      labelTimer.current = setTimeout(() => setCopiedField(undefined), COPIED_LABEL_MS);

      // Cancelling both timers is what keeps a superseded copy from wiping
      // the value that replaced it — the newer copy owns the countdown from
      // here on.
      clearTimeout(wipeTimer.current);
      wipeTimer.current = setTimeout(() => {
        wipePending.current = false;
        void writerRef.current.writeText("");
        setClearingField(undefined);
      }, clearSeconds * 1000);
    },
    [clearSeconds],
  );

  return { copiedField, clearingField, clearingToken, copy };
}
