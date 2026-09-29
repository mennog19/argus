/** `scheme://` — anything with an authority, e.g. `https://`, `ftp://`. */
const HIERARCHICAL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Schemes written without `//`. Listed rather than matched generically
 * because `localhost:8080` has the same shape as `mailto:me` and must be
 * read as a host and port.
 */
const OPAQUE_SCHEME = /^(mailto|tel):/i;

/**
 * The address to hand the browser for an entry's URL field.
 *
 * People type URLs the way they'd type them into an address bar —
 * `github.com/login` — and KeePass files are full of them. Without a scheme
 * the OS opener has nothing to dispatch on, so https is assumed, which is
 * what every browser's address bar does too.
 */
export function openableUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "" || HIERARCHICAL_SCHEME.test(trimmed) || OPAQUE_SCHEME.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/\//, "")}`;
}
