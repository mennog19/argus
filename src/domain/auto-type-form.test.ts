import { describe, expect, it } from "vitest";
import { parseAutoTypeSequence } from "./auto-type";
import { sequenceForForm } from "./auto-type-form";

const FALLBACK = "{USERNAME}{TAB}{PASSWORD}{ENTER}";

describe("sequenceForForm", () => {
  it("focuses each field by name when the form has both", () => {
    expect(sequenceForForm({ hasUsernameField: true, hasPasswordField: true }, FALLBACK)).toBe(
      "{FOCUS USERNAME}{USERNAME}{FOCUS PASSWORD}{PASSWORD}{ENTER}",
    );
  });

  it("only fills the password on a password-only page, like the second step of a login", () => {
    expect(sequenceForForm({ hasUsernameField: false, hasPasswordField: true }, FALLBACK)).toBe(
      "{FOCUS PASSWORD}{PASSWORD}{ENTER}",
    );
  });

  it("only fills the username on a username-only page, like the first step of a login", () => {
    expect(sequenceForForm({ hasUsernameField: true, hasPasswordField: false }, FALLBACK)).toBe(
      "{FOCUS USERNAME}{USERNAME}{ENTER}",
    );
  });

  it("uses the fallback sequence when no field was found", () => {
    expect(sequenceForForm({ hasUsernameField: false, hasPasswordField: false }, FALLBACK)).toBe(
      FALLBACK,
    );
  });

  it("only ever produces sequences that parse", () => {
    for (const hasUsernameField of [true, false]) {
      for (const hasPasswordField of [true, false]) {
        expect(() =>
          parseAutoTypeSequence(sequenceForForm({ hasUsernameField, hasPasswordField }, FALLBACK)),
        ).not.toThrow();
      }
    }
  });
});
