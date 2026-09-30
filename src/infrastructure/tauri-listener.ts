import { UnlistenFn } from "@tauri-apps/api/event";

/**
 * Tauri listeners register asynchronously; this returns a synchronous
 * unsubscribe that also works when called before registration resolves.
 */
export function unsubscribeOnceRegistered(registration: Promise<UnlistenFn>): () => void {
  let unlisten: UnlistenFn | undefined;
  let cancelled = false;

  void registration.then((fn) => {
    if (cancelled) {
      fn();
    } else {
      unlisten = fn;
    }
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}
