/**
 * `name` as a file name Windows accepts, with the characters it forbids
 * replaced, or `fallback` when nothing usable is left. Path separators are
 * among them, so a name read from a vault can't steer a save dialog into
 * another folder.
 */
export function safeFileName(name: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  let safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
  // Windows silently strips trailing dots and spaces from file names.
  while (safe.endsWith(".") || safe.endsWith(" ")) {
    safe = safe.slice(0, -1);
  }
  return safe || fallback;
}
