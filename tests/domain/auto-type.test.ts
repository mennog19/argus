import { describe, expect, it } from "vitest";
import { AutoTypeNoFieldsError, autoTypeSteps } from "../../src/domain/auto-type";

const CREDENTIALS = { username: "menno", password: "hunter2" };

describe("autoTypeSteps", () => {
  it("focuses each field by name when the form has both, then submits", () => {
    expect(autoTypeSteps({ hasUsernameField: true, hasPasswordField: true }, CREDENTIALS)).toEqual([
      { kind: "focus", field: "username" },
      { kind: "text", text: "menno" },
      { kind: "focus", field: "password" },
      { kind: "text", text: "hunter2" },
      { kind: "submit" },
    ]);
  });

  it("only fills the password on a password-only page, like the second step of a login", () => {
    expect(autoTypeSteps({ hasUsernameField: false, hasPasswordField: true }, CREDENTIALS)).toEqual(
      [{ kind: "focus", field: "password" }, { kind: "text", text: "hunter2" }, { kind: "submit" }],
    );
  });

  it("only fills the username on a username-only page, like the first step of a login", () => {
    expect(autoTypeSteps({ hasUsernameField: true, hasPasswordField: false }, CREDENTIALS)).toEqual(
      [{ kind: "focus", field: "username" }, { kind: "text", text: "menno" }, { kind: "submit" }],
    );
  });

  it("leaves the username field alone when the entry has no username", () => {
    expect(
      autoTypeSteps(
        { hasUsernameField: true, hasPasswordField: true },
        { ...CREDENTIALS, username: "" },
      ),
    ).toEqual([
      { kind: "focus", field: "password" },
      { kind: "text", text: "hunter2" },
      { kind: "submit" },
    ]);
  });

  it("leaves the password field alone when the entry has no password", () => {
    expect(
      autoTypeSteps(
        { hasUsernameField: true, hasPasswordField: true },
        { ...CREDENTIALS, password: "" },
      ),
    ).toEqual([
      { kind: "focus", field: "username" },
      { kind: "text", text: "menno" },
      { kind: "submit" },
    ]);
  });

  it("refuses when the page has no login field, rather than typing at whatever has focus", () => {
    expect(() =>
      autoTypeSteps({ hasUsernameField: false, hasPasswordField: false }, CREDENTIALS),
    ).toThrow(AutoTypeNoFieldsError);
  });

  it("refuses when the entry has nothing to type into the fields that are there", () => {
    expect(() =>
      autoTypeSteps(
        { hasUsernameField: true, hasPasswordField: true },
        { username: "", password: "" },
      ),
    ).toThrow(AutoTypeNoFieldsError);
  });
});
