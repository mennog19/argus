import {
  AutoTypeMatch,
  autoTypeMatches,
  Entry,
  generateTotpCode,
  parseAutoTypeSequence,
  resolveAutoTypeSequence,
  totpConfigFromCustomFields,
} from "../domain";
import { AutoTyper, ForegroundWindow } from "./auto-type";

/** A pending auto-type: the window the user was in, and what might fit it. */
export interface AutoTypeRequest {
  readonly window: ForegroundWindow;
  /** Ranked by `autoTypeMatches`; empty when nothing in the vault looks related. */
  readonly matches: readonly AutoTypeMatch[];
}

/**
 * Drives one auto-type press: work out where the keystrokes would go and
 * which entries fit, then — once the user has confirmed an entry — expand
 * that entry's sequence and play it into the remembered window.
 *
 * The password is read out of the `Password` wrapper here and nowhere
 * earlier: `capture` deals only in entries, and the adapter only ever sees
 * the finished steps.
 */
export class AutoTypeService {
  constructor(private readonly autoTyper: AutoTyper) {}

  /**
   * Captures the foreground window and ranks `entries` against its title.
   * Returns undefined when there is no window to type into, which is how a
   * hotkey press with Argus itself in front ends up a no-op.
   */
  async capture(entries: readonly Entry[]): Promise<AutoTypeRequest | undefined> {
    const window = await this.autoTyper.captureTarget();
    if (!window) {
      return undefined;
    }
    return { window, matches: autoTypeMatches(entries, window.title) };
  }

  /** Expands `sequence` for `entry` and types it into the captured window. */
  async perform(entry: Entry, sequence: string): Promise<void> {
    const steps = resolveAutoTypeSequence(sequence, {
      username: entry.username,
      password: entry.password.reveal(),
      url: entry.url,
      title: entry.title,
      totp: await currentTotpCode(entry, sequence),
    });
    await this.autoTyper.typeIntoTarget(steps);
  }
}

/**
 * The entry's live TOTP code, but only when `sequence` actually asks for one
 * — there's no reason to run the HMAC for a sequence that will never type it.
 */
async function currentTotpCode(entry: Entry, sequence: string): Promise<string | undefined> {
  const wanted = parseAutoTypeSequence(sequence).some(
    (token) => token.kind === "field" && token.field === "totp",
  );
  if (!wanted) {
    return undefined;
  }
  const config = totpConfigFromCustomFields(entry.customFields);
  if (!config) {
    return undefined;
  }
  return (await generateTotpCode(config)).value;
}
