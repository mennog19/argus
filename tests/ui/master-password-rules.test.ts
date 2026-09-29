import { describe, expect, it } from "vitest";
import { MASTER_PASSWORD_HINT, masterPasswordRuleError } from "../../src/ui/master-password-rules";

describe("masterPasswordRuleError", () => {
  it("is undefined for an acceptable password", () => {
    expect(masterPasswordRuleError("Master password", "Hunter2-long")).toBeUndefined();
  });

  it("names a single missing rule on its own", () => {
    expect(masterPasswordRuleError("New password", "Hunter22long")).toBe(
      "New password needs a symbol.",
    );
  });

  it("names two missing rules joined with 'and'", () => {
    expect(masterPasswordRuleError("Master password", "hunter-long")).toBe(
      "Master password needs a capital letter and a number.",
    );
  });

  it("names every missing rule in one sentence", () => {
    expect(masterPasswordRuleError("Master password", "abc")).toBe(
      "Master password needs at least 8 characters, a capital letter, a number and a symbol.",
    );
  });
});

describe("MASTER_PASSWORD_HINT", () => {
  it("summarises the rules", () => {
    expect(MASTER_PASSWORD_HINT).toBe("8+ characters, with A-Z, 0-9 and a symbol");
  });
});
