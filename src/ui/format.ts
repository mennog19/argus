import { GroupContents } from "./vault-browsing";

/** Last path segment, accepting both `/` and `\` separators. */
export function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

/** Coarse human-readable file size, e.g. "48 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/** Coarse "N units ago" rendering of an ISO timestamp, relative to `now`. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

const DATE_TIME = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** A date and time in the user's locale, e.g. "12 Mar 2026, 14:05"; "Unknown date" when missing. */
export function formatDateTime(date: Date | undefined): string {
  return date ? DATE_TIME.format(date) : "Unknown date";
}

/** Groups a TOTP code into 3-digit clusters for readability, e.g. "123 456". */
export function formatTotpCode(code: string): string {
  return code.match(/.{1,3}/g)!.join(" ");
}

/**
 * Whether two paths point at the same file. Separators and any trailing slash
 * are normalized away, and the comparison ignores case because the desktop
 * platforms Argus targets treat paths that way.
 */
export function isSamePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * What a group would put back when restored, e.g. "3 entries · 1 subgroup".
 * The entry count is always spelled out, so an empty group reads "0 entries"
 * rather than going silent.
 */
export function formatGroupContents({ entries, groups }: GroupContents): string {
  const entryPart = `${entries} ${entries === 1 ? "entry" : "entries"}`;
  if (groups === 0) {
    return entryPart;
  }
  return `${entryPart} · ${groups} ${groups === 1 ? "subgroup" : "subgroups"}`;
}
