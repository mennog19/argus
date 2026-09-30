import { useRef, useState } from "react";
import { AvailableUpdate, Updater } from "../application/updater";

export interface LaunchUpdateCheck {
  /** The newer version found, while the user hasn't dismissed it. */
  readonly update: AvailableUpdate | undefined;
  /**
   * Asks for a newer version. Only the first call does anything, so the
   * check happens once per launch however often the settings load.
   */
  readonly check: () => void;
  readonly dismiss: () => void;
}

/**
 * The one update check Argus makes when it starts, if the user turned it on.
 * A failed check (offline, GitHub unreachable) is silent: nothing is shown
 * unless there really is an update.
 */
export function useLaunchUpdateCheck(updater: Updater): LaunchUpdateCheck {
  const [update, setUpdate] = useState<AvailableUpdate | undefined>(undefined);
  const checked = useRef(false);

  return {
    update,
    check: () => {
      if (checked.current) {
        return;
      }
      checked.current = true;
      updater
        .checkForUpdate()
        .then(setUpdate)
        .catch(() => {
          // Best-effort; the next launch checks again.
        });
    },
    dismiss: () => setUpdate(undefined),
  };
}
