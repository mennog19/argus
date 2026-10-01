import { useCallback, useState } from "react";
import { errorMessage } from "./error-message";

export interface AsyncAction {
  /** True while a `run` is still in flight, for disabling its controls. */
  readonly busy: boolean;
  /** The last failure's message, until the next `run` or `clearError`. */
  readonly error: string | undefined;
  /**
   * Runs `action`, turning a rejection into `error` instead of propagating.
   *
   * Resolves `true` only when the action actually succeeded, so a caller can
   * gate "now close the form" on it. Getting that wrong is how a failed save
   * ends up looking like a successful one.
   */
  readonly run: (action: () => Promise<void>, fallbackMessage?: string) => Promise<boolean>;
  /** Shows a message the caller produced itself, e.g. a validation failure. */
  readonly fail: (message: string) => void;
  readonly clearError: () => void;
}

const DEFAULT_FALLBACK = "Something went wrong.";

/**
 * The "run something, disable the button, show what went wrong" pattern that
 * every screen doing a save needs.
 */
export function useAsyncAction(): AsyncAction {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const run = useCallback(
    async (action: () => Promise<void>, fallbackMessage = DEFAULT_FALLBACK): Promise<boolean> => {
      setBusy(true);
      setError(undefined);
      try {
        await action();
        return true;
      } catch (cause) {
        setError(errorMessage(cause, fallbackMessage));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const fail = useCallback((message: string) => setError(message), []);
  const clearError = useCallback(() => setError(undefined), []);

  return { busy, error, run, fail, clearError };
}
