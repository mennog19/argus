import { useCallback, useEffect, useRef, useState } from "react";
import { GlobalHotkey } from "../application/auto-type";
import { AutoTypeRequest, AutoTypeService } from "../application/auto-type-service";
import { AutoTypeSettings } from "../application/settings";
import { Entry } from "../domain";
import { errorMessage } from "./error-message";

export interface AutoTypeController {
  /** The pending pick, or undefined when no hotkey press is waiting on the user. */
  readonly request: AutoTypeRequest | undefined;
  /** Why the last registration, capture, or type attempt failed. */
  readonly error: string | undefined;
  /** Types `entry` into the captured window and closes the picker. */
  readonly typeInto: (entry: Entry) => void;
  /** Closes the picker without typing anything. */
  readonly dismiss: () => void;
  readonly dismissError: () => void;
}

/**
 * Binds the auto-type hotkey while the vault is unlocked and holds the state
 * of one press: which window was captured, what matched it, and anything that
 * went wrong.
 *
 * The hotkey is bound once per accelerator, not once per vault change —
 * `entries` is read through a ref so that adding an entry doesn't tear the
 * registration down and put it back up, which the OS would briefly see as the
 * combination being free.
 */
export function useAutoType(
  service: AutoTypeService,
  globalHotkey: GlobalHotkey,
  settings: AutoTypeSettings,
  entries: readonly Entry[],
): AutoTypeController {
  const [request, setRequest] = useState<AutoTypeRequest | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // The latest entries, reachable from the hotkey handler without making the
  // handler (and therefore the registration) depend on them.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    if (!settings.enabled) {
      return;
    }

    void globalHotkey
      .register(settings.hotkey, () => {
        void service
          .capture(entriesRef.current)
          .then((captured) => {
            // Undefined means Argus itself was in front — the press was
            // aimed at nothing, so leave whatever is on screen alone.
            if (captured) {
              setError(undefined);
              setRequest(captured);
            }
          })
          .catch((cause) => setError(errorMessage(cause, "Auto-type could not read the window.")));
      })
      .catch((cause) =>
        setError(
          errorMessage(cause, `Could not register ${settings.hotkey}. Another app may hold it.`),
        ),
      );

    return () => {
      setRequest(undefined);
      void globalHotkey.unregister();
    };
  }, [globalHotkey, service, settings.enabled, settings.hotkey]);

  const dismiss = useCallback(() => setRequest(undefined), []);

  const dismissError = useCallback(() => setError(undefined), []);

  const typeInto = useCallback(
    (entry: Entry) => {
      // Closed first: the keystrokes land in the other application, so
      // leaving the picker up would only obscure the result.
      setRequest(undefined);
      void service
        .perform(entry)
        .catch((cause) => setError(errorMessage(cause, "Auto-type failed.")));
    },
    [service],
  );

  return { request, error, typeInto, dismiss, dismissError };
}
