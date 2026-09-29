import { Entry } from "./entry";

/**
 * Ranks vault entries against the window that was focused when the auto-type
 * hotkey was pressed.
 *
 * A window title is the only thing every app gives us, and it's weak: a web
 * page sets its own, so a phishing page can call itself "github.com – Sign
 * in". For a browser Argus also reads the real address from the address bar,
 * which the page can't forge; when it has one, an entry with a URL matches on
 * that address alone and the title is ignored for it.
 *
 * Matching is ranked rather than decided either way: the picker shows the
 * candidates in this order and the user confirms.
 */

/** How strongly an entry matched, highest first. */
export const AUTO_TYPE_MATCH_SCORES = {
  /** The entry's host is the host in the browser's address bar (or a parent domain of it). */
  address: 4,
  /** The entry's full host (`github.com`) appears in the window title. */
  host: 3,
  /** The host's site name (`github` out of `github.com`) appears in the title. */
  siteName: 2,
  /** The entry's title appears in the window title. */
  title: 1,
} as const;

/** What auto-type knows about the window keystrokes would go to. */
export interface AutoTypeTarget {
  /** The window's caption — for a browser, usually "<page title> — <browser>". */
  readonly title: string;
  /**
   * The address in the browser's address bar, when the window is a browser
   * and it could be read. Undefined for every other app.
   */
  readonly url?: string;
}

export interface AutoTypeMatch {
  readonly entry: Entry;
  readonly score: number;
  /**
   * The match rests on the page's real address rather than on its title.
   * Only a verified match is safe to confirm without looking at the address
   * bar yourself.
   */
  readonly verified: boolean;
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
 * Browsers show the address bar the same way.
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
 * Whether a page at `pageHost` belongs to an entry saved for `entryHost`:
 * the same host, or a subdomain of it (`accounts.google.com` for an entry
 * saved as `google.com`). Never the other way round, and never a lookalike —
 * `github.com.evil.example` is not a subdomain of `github.com`.
 */
function sameSite(pageHost: string, entryHost: string): boolean {
  return pageHost === entryHost || pageHost.endsWith(`.${entryHost}`);
}

/** The title-only ranking: all there is for apps that aren't browsers. */
function titleScore(entry: Entry, windowTitle: string): number {
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
 * How well `entry` matches `target`, or 0 for no match. The strongest signal
 * wins: an entry whose host appears scores as a host match even if its title
 * happens to appear too.
 *
 * With a known address, an entry that has a URL of its own is judged on that
 * address only — a page whose address says `evil.example` never matches an
 * entry for `github.com`, whatever its title claims. An entry with no URL
 * has nothing to check the address against, so it can still match on title,
 * ranked lowest.
 */
export function autoTypeMatchScore(entry: Entry, target: AutoTypeTarget): number {
  if (target.url === undefined) {
    return titleScore(entry, target.title);
  }
  const entryHost = autoTypeHost(entry.url);
  if (entryHost !== "") {
    return sameSite(autoTypeHost(target.url), entryHost) ? AUTO_TYPE_MATCH_SCORES.address : 0;
  }
  return contains(target.title.toLowerCase(), matchable(entry.title))
    ? AUTO_TYPE_MATCH_SCORES.title
    : 0;
}

/**
 * The entries worth offering for `target`, strongest match first and then
 * alphabetically by title so the order is stable between presses.
 */
export function autoTypeMatches(
  entries: readonly Entry[],
  target: AutoTypeTarget,
): AutoTypeMatch[] {
  return entries
    .map((entry) => {
      const score = autoTypeMatchScore(entry, target);
      return { entry, score, verified: score === AUTO_TYPE_MATCH_SCORES.address };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
}

/**
 * Entries the window's title points at but its real address rules out: the
 * page calls itself `github.com`, the address bar says otherwise. That's what
 * a phishing page looks like, so the picker warns about it rather than just
 * leaving the entries out. Always empty when the address isn't known.
 */
export function autoTypeTitleMismatches(
  entries: readonly Entry[],
  target: AutoTypeTarget,
): Entry[] {
  if (target.url === undefined) {
    return [];
  }
  return entries.filter(
    (entry) =>
      autoTypeHost(entry.url) !== "" &&
      autoTypeMatchScore(entry, target) === 0 &&
      titleScore(entry, target.title) >= AUTO_TYPE_MATCH_SCORES.siteName,
  );
}
