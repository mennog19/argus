import { useEffect, useRef, useState } from "react";
import { Vault } from "../domain";
import { applyExpiredEntryAction, nextExpiry } from "../application/entry-expiry";
import { ExpiredEntryAction } from "../application/settings";

/** `setTimeout` takes a signed 32-bit delay; anything longer fires at once. */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/**
 * Applies `action` to the open vault's expired entries: right after unlock,
 * whenever the vault or the setting changes, and again the moment the next
 * entry expires while the vault stays open. That moment also re-renders the
 * caller, so an entry left in place picks up its "Expired" badge on time.
 *
 * `session` is the unlocked vault, handed back to `save`; `undefined` means
 * no vault is open.
 */
export function useExpiredEntries<Session extends { readonly vault: Vault }>(
  session: Session | undefined,
  action: ExpiredEntryAction,
  save: (next: Vault, session: Session) => Promise<void>,
): void {
  const [expiryTick, setExpiryTick] = useState(0);
  // Read through a ref so a caller passing a fresh callback each render
  // doesn't re-run the check on every render.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  // One write at a time: the vault changes again while the first is in
  // flight (the entry-opened stamp, the next expiry), and a second write of
  // the same expired entries would race it.
  const saving = useRef(false);

  useEffect(() => {
    if (!session || saving.current) {
      return;
    }
    const next = applyExpiredEntryAction(session.vault, action, new Date());
    if (next === session.vault) {
      return;
    }
    saving.current = true;
    // A failed save is already surfaced by the save itself (a conflict opens
    // its dialog); the entries are tried again on the next vault change.
    void saveRef
      .current(next, session)
      .catch(() => undefined)
      .then(() => {
        saving.current = false;
      });
  }, [session, action, expiryTick]);

  const vault = session?.vault;
  useEffect(() => {
    if (!vault) {
      return;
    }
    const due = nextExpiry(vault, new Date());
    if (!due) {
      return;
    }
    const delay = Math.min(due.getTime() - Date.now(), MAX_TIMER_DELAY_MS);
    const timer = setTimeout(() => setExpiryTick((tick) => tick + 1), delay);
    return () => clearTimeout(timer);
  }, [vault, expiryTick]);
}
