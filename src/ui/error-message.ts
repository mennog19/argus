/**
 * Turns a caught value into something worth showing the user.
 *
 * Tauri rejects failed `invoke` calls with a plain string rather than an
 * `Error` (e.g. "forbidden path" from the filesystem scope), so a bare
 * `instanceof Error` check would swallow exactly the failures that are
 * hardest to diagnose and show `fallback` instead.
 */
export function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim() !== "") {
    return cause.message;
  }
  if (typeof cause === "string" && cause.trim() !== "") {
    return cause;
  }
  return fallback;
}
