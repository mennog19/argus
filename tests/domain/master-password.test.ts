import { describe, expect, it } from "vitest";
import { MASTER_PASSWORD_MIN_LENGTH, unmetMasterPasswordRequirements } from "../../src/domain";

describe("unmetMasterPasswordRequirements", () => {
  it("requires at least 8 characters", () => {
    expect(MASTER_PASSWORD_MIN_LENGTH).toBe(8);
    expect(unmetMasterPasswordRequirements("Ab1!xyz")).toEqual(["length"]);
    expect(unmetMasterPasswordRequirements("Ab1!wxyz")).toEqual([]);
  });

  it("requires a capital letter, a number, and a symbol", () => {
    expect(unmetMasterPasswordRequirements("lowercase-only")).toEqual(["uppercase", "digit"]);
    expect(unmetMasterPasswordRequirements("NoDigitsHere!")).toEqual(["digit"]);
    expect(unmetMasterPasswordRequirements("NoSymbols123")).toEqual(["symbol"]);
  });

  it("lists every unmet requirement in a fixed order", () => {
    expect(unmetMasterPasswordRequirements("")).toEqual(["length", "uppercase", "digit", "symbol"]);
  });

  it("counts non-ASCII capitals and punctuation, but not whitespace, as a symbol", () => {
    expect(unmetMasterPasswordRequirements("Überweg1€€")).toEqual([]);
    expect(unmetMasterPasswordRequirements("Has Spaces 123")).toEqual(["symbol"]);
  });
});
