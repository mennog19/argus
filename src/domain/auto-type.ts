/**
 * The auto-type sequence language: a small, KeePass-compatible subset used to
 * describe what Argus types into another application's focused input fields.
 *
 * A sequence is literal text with `{...}` placeholders mixed in — field
 * placeholders (`{USERNAME}`) expand to entry data, key placeholders
 * (`{TAB}`) become synthetic key presses, and `{DELAY 500}` pauses. `{{}` and
 * `{}}` are the escapes for literal braces.
 *
 * Parsing is pure and happens here so the OS-facing adapter only ever
 * receives a flat list of already-resolved steps — it never sees an entry,
 * and the secret it types is assembled at the last possible moment.
 */

/** Entry fields a sequence can interpolate. */
export const AUTO_TYPE_FIELDS = ["username", "password", "totp", "url", "title"] as const;

export type AutoTypeField = (typeof AUTO_TYPE_FIELDS)[number];

/** Non-character keys a sequence can press. */
export const AUTO_TYPE_KEYS = [
  "tab",
  "enter",
  "space",
  "backspace",
  "delete",
  "escape",
  "home",
  "end",
  "up",
  "down",
  "left",
  "right",
] as const;

export type AutoTypeKey = (typeof AUTO_TYPE_KEYS)[number];

/**
 * Form fields a sequence can move focus to with `{FOCUS USERNAME}`. Unlike
 * `{TAB}`, this doesn't depend on what sits between the fields: the adapter
 * finds the field itself.
 */
export const AUTO_TYPE_FORM_FIELDS = ["username", "password"] as const;

export type AutoTypeFormField = (typeof AUTO_TYPE_FORM_FIELDS)[number];

/** Placeholder spellings accepted inside `{...}`, normalized to lower case. */
const FIELD_NAMES: Readonly<Record<string, AutoTypeField>> = {
  username: "username",
  user: "username",
  password: "password",
  totp: "totp",
  url: "url",
  title: "title",
};

const KEY_NAMES: Readonly<Record<string, AutoTypeKey>> = {
  tab: "tab",
  enter: "enter",
  return: "enter",
  space: "space",
  backspace: "backspace",
  delete: "delete",
  esc: "escape",
  escape: "escape",
  home: "home",
  end: "end",
  up: "up",
  down: "down",
  left: "left",
  right: "right",
};

/** What a parsed sequence is made of, before entry data is filled in. */
export type AutoTypeToken =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "field"; readonly field: AutoTypeField }
  | { readonly kind: "key"; readonly key: AutoTypeKey }
  | { readonly kind: "focus"; readonly field: AutoTypeFormField }
  | { readonly kind: "delay"; readonly milliseconds: number };

/** A fully resolved instruction for the OS adapter: no entry data left to look up. */
export type AutoTypeStep =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "key"; readonly key: AutoTypeKey }
  | { readonly kind: "focus"; readonly field: AutoTypeFormField }
  | { readonly kind: "delay"; readonly milliseconds: number };

/** The values a sequence's field placeholders expand to. */
export interface AutoTypeValues {
  readonly username: string;
  readonly password: string;
  readonly url: string;
  readonly title: string;
  /** The entry's current TOTP code, or undefined when it has no authenticator configured. */
  readonly totp?: string;
}

/** What Argus types when an entry doesn't override the sequence itself. */
export const DEFAULT_AUTO_TYPE_SEQUENCE = "{USERNAME}{TAB}{PASSWORD}{ENTER}";

/** Longest pause a `{DELAY n}` may request, so a typo can't wedge auto-type for minutes. */
export const MAX_AUTO_TYPE_DELAY_MS = 10_000;

/** Thrown by `parseAutoTypeSequence` when a sequence contains an unusable placeholder. */
export class AutoTypeSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoTypeSequenceError";
  }
}

// Ordered alternation: the brace escapes have to win before the generic
// placeholder rule, which would otherwise swallow `{}}` as an empty
// placeholder followed by a stray `}`.
const TOKEN_PATTERN = /\{\{\}|\{\}\}|\{([^{}]*)\}/g;

const DELAY_PATTERN = /^delay\s+(\d+)$/;

const FOCUS_PATTERN = /^focus\s+(username|password)$/;

function parsePlaceholder(name: string): AutoTypeToken {
  const normalized = name.trim().toLowerCase();

  const field = FIELD_NAMES[normalized];
  if (field) {
    return { kind: "field", field };
  }

  const key = KEY_NAMES[normalized];
  if (key) {
    return { kind: "key", key };
  }

  const focus = FOCUS_PATTERN.exec(normalized);
  if (focus) {
    return { kind: "focus", field: focus[1] as AutoTypeFormField };
  }

  const delay = DELAY_PATTERN.exec(normalized);
  if (delay) {
    const milliseconds = Number(delay[1]);
    if (milliseconds > MAX_AUTO_TYPE_DELAY_MS) {
      throw new AutoTypeSequenceError(`{${name}} waits longer than ${MAX_AUTO_TYPE_DELAY_MS}ms`);
    }
    return { kind: "delay", milliseconds };
  }

  throw new AutoTypeSequenceError(`{${name}} is not a known auto-type placeholder`);
}

/**
 * Splits `sequence` into tokens. Text outside `{...}` is taken literally,
 * including an unpaired brace. Throws `AutoTypeSequenceError` on a
 * placeholder that isn't a known field, key, or `{DELAY n}`.
 */
export function parseAutoTypeSequence(sequence: string): AutoTypeToken[] {
  const tokens: AutoTypeToken[] = [];
  let textStart = 0;

  TOKEN_PATTERN.lastIndex = 0;
  for (let match = TOKEN_PATTERN.exec(sequence); match; match = TOKEN_PATTERN.exec(sequence)) {
    if (match.index > textStart) {
      tokens.push({ kind: "text", text: sequence.slice(textStart, match.index) });
    }
    textStart = match.index + match[0].length;

    if (match[0] === "{{}") {
      tokens.push({ kind: "text", text: "{" });
    } else if (match[0] === "{}}") {
      tokens.push({ kind: "text", text: "}" });
    } else {
      tokens.push(parsePlaceholder(match[1]));
    }
  }

  if (textStart < sequence.length) {
    tokens.push({ kind: "text", text: sequence.slice(textStart) });
  }
  return tokens;
}

/**
 * The reason `sequence` can't be used, for inline validation in settings, or
 * undefined when it parses. A sequence that types nothing at all counts as
 * invalid: silently doing nothing is the worst possible auto-type outcome.
 */
export function autoTypeSequenceError(sequence: string): string | undefined {
  let tokens: AutoTypeToken[];
  try {
    tokens = parseAutoTypeSequence(sequence);
  } catch (cause) {
    return (cause as AutoTypeSequenceError).message;
  }
  return tokens.length === 0 ? "The sequence is empty" : undefined;
}

/**
 * Expands `sequence` against `values` into steps the OS adapter can execute.
 * A field with no value (an entry without a username, or `{TOTP}` on an entry
 * with no authenticator) contributes no step rather than an empty one, so the
 * surrounding `{TAB}`s still land where they should.
 */
export function resolveAutoTypeSequence(sequence: string, values: AutoTypeValues): AutoTypeStep[] {
  const text: Readonly<Record<AutoTypeField, string>> = {
    username: values.username,
    password: values.password,
    url: values.url,
    title: values.title,
    totp: values.totp ?? "",
  };

  return parseAutoTypeSequence(sequence).flatMap<AutoTypeStep>((token) => {
    if (token.kind !== "field") {
      return [token];
    }
    const value = text[token.field];
    return value === "" ? [] : [{ kind: "text", text: value }];
  });
}
