/**
 * What auto-type does to another application's login form.
 *
 * The OS adapter reports which login fields the window has (`FormLayout`);
 * `autoTypeSteps` turns that plus an entry's credentials into a flat list of
 * already-resolved steps. The adapter never sees an entry, and the secret it
 * types is assembled at the last possible moment.
 *
 * There is deliberately no user-authored sequence: any fixed order of keys
 * breaks on the first site that puts an icon, a "show password" toggle, or an
 * extra field between the inputs. Steps aim at fields by what they are.
 */

/** Which of the two login fields are on screen in the target window. */
export interface FormLayout {
  readonly hasUsernameField: boolean;
  readonly hasPasswordField: boolean;
}

/** Form fields a step can move focus to. */
export type AutoTypeFormField = "username" | "password";

/** A fully resolved instruction for the OS adapter: no entry data left to look up. */
export type AutoTypeStep =
  /** Puts the caret in the named field with its existing text selected. */
  | { readonly kind: "focus"; readonly field: AutoTypeFormField }
  | { readonly kind: "text"; readonly text: string }
  /** Presses Enter. */
  | { readonly kind: "submit" };

/** The entry values auto-type can fill in. */
export interface AutoTypeCredentials {
  readonly username: string;
  readonly password: string;
}

/** Thrown by `autoTypeSteps` when there is nothing it could fill in. */
export class AutoTypeNoFieldsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoTypeNoFieldsError";
  }
}

/**
 * The steps that fill exactly the fields `layout` has, then press Enter.
 *
 * A password field with no username field is the second step of a two-step
 * login; a username field with no password field is the first. Either way only
 * what's present is filled. A field whose value the entry doesn't have is left
 * untouched rather than cleared. Throws `AutoTypeNoFieldsError` when there's
 * nothing to fill: typing at whatever happens to have focus is exactly the
 * guess this exists to avoid.
 */
export function autoTypeSteps(
  layout: FormLayout,
  credentials: AutoTypeCredentials,
): AutoTypeStep[] {
  const steps: AutoTypeStep[] = [];

  if (layout.hasUsernameField && credentials.username !== "") {
    steps.push({ kind: "focus", field: "username" }, { kind: "text", text: credentials.username });
  }
  if (layout.hasPasswordField && credentials.password !== "") {
    steps.push({ kind: "focus", field: "password" }, { kind: "text", text: credentials.password });
  }

  if (steps.length === 0) {
    throw new AutoTypeNoFieldsError(
      layout.hasUsernameField || layout.hasPasswordField
        ? "This entry has no username or password to type into that page."
        : "Couldn't find a username or password field in that window.",
    );
  }
  return [...steps, { kind: "submit" }];
}
