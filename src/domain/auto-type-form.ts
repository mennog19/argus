/**
 * What auto-type found in the target window's form: which of the two login
 * fields are on screen. Reported by the OS adapter (via UI Automation), so it
 * describes the page as it is right now rather than as a sequence assumes it.
 */
export interface FormLayout {
  readonly hasUsernameField: boolean;
  readonly hasPasswordField: boolean;
}

/**
 * The sequence that fills exactly the fields `layout` has, by focusing each
 * one directly instead of counting `{TAB}`s through whatever else the page
 * puts between them — icons, "show password" toggles, extra inputs.
 *
 * A password field with no username field is the second step of a two-step
 * login; a username field with no password field is the first. Either way only
 * what's present is filled, and Enter moves on. When neither was found there's
 * nothing to aim at, so `fallback` — the user's own sequence — types into
 * whatever has focus.
 */
export function sequenceForForm(layout: FormLayout, fallback: string): string {
  if (layout.hasUsernameField && layout.hasPasswordField) {
    return "{FOCUS USERNAME}{USERNAME}{FOCUS PASSWORD}{PASSWORD}{ENTER}";
  }
  if (layout.hasPasswordField) {
    return "{FOCUS PASSWORD}{PASSWORD}{ENTER}";
  }
  if (layout.hasUsernameField) {
    return "{FOCUS USERNAME}{USERNAME}{ENTER}";
  }
  return fallback;
}
