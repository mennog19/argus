import { Entry } from "./entry";

/**
 * Ranks vault entries against the title of whatever window was focused when
 * the auto-type hotkey was pressed.
 *
 * A window title is all the OS gives us — "Sign in to GitHub · GitHub — Mozilla
 * Firefox" — so matching is deliberately fuzzy and deliberately ranked rather
 * than decided: the picker shows the candidates in this order and the user
 * confirms. Nothing is ever typed on a guess alone unless exactly one entry
 * matched on its host name.
 */

/** How strongly an entry matched, highest first. */
export const AUTO_TYPE_MATCH_SCORES = {
  /** The entry's full host (`github.com`) appears in the window title. */
  host: 3,
  /** The host's site name (`github` out of `github.com`) appears. */
  siteName: 2,
  /** The entry's title appears. */
  title: 1,
} as const;

export interface AutoTypeMatch {
  readonly entry: Entry;
  readonly score: number;
}

/**
 * Shortest entry title or site name that may be matched against a window
 * title. Two characters match far too much ("id", "go") to be worth offering.
 */
const MIN_MATCH_LENGTH = 3;

/**
 * The host part of `url`, lower-cased and stripped of scheme, credentials,
 * port, path, and a leading `www.`.
 *
 * Hand-rolled rather than `new URL()` because entry URLs are user-typed and
 * frequently scheme-less (`github.com/login`), which `URL` rejects outright.
 */
export function autoTypeHost(url: string): string {
  const withoutScheme = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const authority = withoutScheme.split(/[/?#]/)[0];
  const host = authority.slice(authority.indexOf("@") + 1);
  return host
    .replace(/:\d+$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

/**
 * The site name inside a host: the label before the top-level domain, so
 * `mail.google.com` and `google.com` both yield `google`. Empty for a host
 * with no dot (`localhost`) — there's nothing left to strip.
 */
export function autoTypeSiteName(host: string): string {
  const labels = host.split(".");
  return labels.length < 2 ? "" : labels[labels.length - 2];
}

function matchable(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.length < MIN_MATCH_LENGTH ? "" : trimmed;
}

function contains(windowTitle: string, needle: string): boolean {
  return needle !== "" && windowTitle.includes(needle);
}

/**
 * How well `entry` matches `windowTitle`, or 0 for no match. The strongest
 * signal wins: an entry whose host appears scores as a host match even if its
 * title happens to appear too.
 */
export function autoTypeMatchScore(entry: Entry, windowTitle: string): number {
  const haystack = windowTitle.toLowerCase();
  const host = autoTypeHost(entry.url);

  if (contains(haystack, matchable(host))) {
    return AUTO_TYPE_MATCH_SCORES.host;
  }
  if (contains(haystack, matchable(autoTypeSiteName(host)))) {
    return AUTO_TYPE_MATCH_SCORES.siteName;
  }
  if (contains(haystack, matchable(entry.title))) {
    return AUTO_TYPE_MATCH_SCORES.title;
  }
  return 0;
}

/**
 * The entries worth offering for `windowTitle`, strongest match first and
 * then alphabetically by title so the order is stable between presses.
 */
export function autoTypeMatches(entries: readonly Entry[], windowTitle: string): AutoTypeMatch[] {
  return entries
    .map((entry) => ({ entry, score: autoTypeMatchScore(entry, windowTitle) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
}
