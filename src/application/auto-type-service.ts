import {
  AutoTypeMatch,
  autoTypeMatches,
  autoTypeSteps,
  autoTypeTitleMismatches,
  Entry,
} from "../domain";
import { AutoTyper, ForegroundWindow } from "./auto-type";

/** A pending auto-type: the window the user was in, and what might fit it. */
export interface AutoTypeRequest {
  readonly window: ForegroundWindow;
  /** Ranked by `autoTypeMatches`; empty when nothing in the vault looks related. */
  readonly matches: readonly AutoTypeMatch[];
  /**
   * Entries the page's title names but its real address rules out — the
   * signature of a phishing page. See `autoTypeTitleMismatches`.
   */
  readonly titleMismatches: readonly Entry[];
}

/**
 * Drives one auto-type press: work out where the keystrokes would go and
 * which entries fit, then — once the user has confirmed an entry — find the
 * login fields in that window and fill them.
 *
 * The password is read out of the `Password` wrapper here and nowhere
 * earlier: `capture` deals only in entries, and the adapter only ever sees
 * the finished steps.
 */
export class AutoTypeService {
  constructor(private readonly autoTyper: AutoTyper) {}

  /**
   * Captures the foreground window and ranks `entries` against its address
   * when it's a browser that could be read, or its title otherwise.
   * Returns undefined when there is no window to type into, which is how a
   * hotkey press with Argus itself in front ends up a no-op.
   */
  async capture(entries: readonly Entry[]): Promise<AutoTypeRequest | undefined> {
    const window = await this.autoTyper.captureTarget();
    if (!window) {
      return undefined;
    }
    return {
      window,
      matches: autoTypeMatches(entries, window),
      titleMismatches: autoTypeTitleMismatches(entries, window),
    };
  }

  /**
   * Fills `entry` into the login fields the captured window has. Rejects —
   * without typing anything — when the window can't be inspected or has no
   * login field to aim at.
   */
  async perform(entry: Entry): Promise<void> {
    const layout = await this.autoTyper.inspectTarget();
    const steps = autoTypeSteps(layout, {
      username: entry.username,
      password: entry.password.reveal(),
    });
    await this.autoTyper.typeIntoTarget(steps);
  }
}
