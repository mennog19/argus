import { Vault } from "../domain";
import { ExpiredEntryAction } from "./settings";

/**
 * `vault` with `action` applied to every entry expired by `now`. Returns
 * `vault` itself when there's nothing to do, so the caller can skip a save.
 * Entries already in the recycle bin are left alone either way.
 */
export function applyExpiredEntryAction(
  vault: Vault,
  action: ExpiredEntryAction,
  now: Date,
): Vault {
  if (action === "mark") {
    return vault;
  }
  return vault
    .expiredEntries(now)
    .reduce(
      (next, entry) =>
        action === "recycle" ? next.deleteEntry(entry.id) : next.purgeEntry(entry.id),
      vault,
    );
}

/**
 * The soonest expiry date still ahead of `now`, outside the recycle bin, or
 * `undefined` when no entry is due to expire.
 */
export function nextExpiry(vault: Vault, now: Date): Date | undefined {
  const upcoming = vault
    .entriesWithExpiry()
    .map((entry) => entry.expiresAt!.getTime())
    .filter((time) => time > now.getTime());
  return upcoming.length === 0 ? undefined : new Date(Math.min(...upcoming));
}
