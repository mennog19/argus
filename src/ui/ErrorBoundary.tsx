import { Component, ReactNode, useEffect, useState } from "react";
import { VaultSaveConflictError } from "../application/vault-access-service";
import { errorMessage } from "./error-message";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Runs once when a render error takes the app down, before the crash
   * screen shows. For dropping the open vault: what's on screen is gone, but
   * its decrypted contents would otherwise stay in memory behind it.
   */
  onCrash: () => void;
  /** Starts the app over from the crash screen. */
  onRestart: () => void;
}

interface RenderBoundaryState {
  crashed: boolean;
  error: unknown;
}

const UNKNOWN_ERROR = "Unknown error.";

/**
 * Catches an error thrown while rendering. Without it React unmounts the
 * whole tree and leaves an empty window, with nothing to say what happened
 * or how to get going again.
 */
class RenderBoundary extends Component<ErrorBoundaryProps, RenderBoundaryState> {
  state: RenderBoundaryState = { crashed: false, error: undefined };

  static getDerivedStateFromError(error: unknown): RenderBoundaryState {
    return { crashed: true, error };
  }

  componentDidCatch(): void {
    this.props.onCrash();
  }

  render(): ReactNode {
    if (!this.state.crashed) {
      return this.props.children;
    }
    return (
      <div className="screen-centered" role="alert">
        <div className="screen-heading">
          <h1>Argus ran into a problem</h1>
          <p>
            Your vault has been locked. Everything that was already saved is safe; an edit that was
            still open is not.
          </p>
        </div>
        <div className="screen-panel">
          <div className="field-error">{errorMessage(this.state.error, UNKNOWN_ERROR)}</div>
          <button type="button" className="btn-primary" onClick={this.props.onRestart}>
            Restart Argus
          </button>
        </div>
      </div>
    );
  }
}

/**
 * The message of the last error nothing caught: one thrown from an event
 * handler or a timer, or a promise rejected with nobody awaiting it. Those
 * don't break rendering, so the app carries on, but without this they would
 * fail in silence and leave the user guessing why nothing happened.
 */
function useUncaughtError(): [string | undefined, () => void] {
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    function handleError(event: ErrorEvent) {
      // Browsers also report notices here that carry no error at all, such as
      // a ResizeObserver that couldn't deliver in one frame. Nothing failed.
      if (event.error != null) {
        setMessage(errorMessage(event.error, UNKNOWN_ERROR));
      }
    }
    function handleRejection(event: PromiseRejectionEvent) {
      // A save conflict already has a dialog of its own asking what to do.
      if (!(event.reason instanceof VaultSaveConflictError)) {
        setMessage(errorMessage(event.reason, UNKNOWN_ERROR));
      }
    }
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return [message, () => setMessage(undefined)];
}

/**
 * The app's last line of defence against its own bugs: a crash screen for
 * errors that break rendering, and a dismissible notice for the ones that
 * don't.
 */
export function ErrorBoundary({ children, onCrash, onRestart }: ErrorBoundaryProps) {
  const [uncaught, dismissUncaught] = useUncaughtError();

  return (
    <>
      <RenderBoundary onCrash={onCrash} onRestart={onRestart}>
        {children}
      </RenderBoundary>
      {uncaught && (
        <div className="auto-type-toast" role="alert">
          <span>Something went wrong: {uncaught}</span>
          <button
            type="button"
            className="auto-type-toast-dismiss"
            aria-label="Dismiss error"
            onClick={dismissUncaught}
          >
            &times;
          </button>
        </div>
      )}
    </>
  );
}
