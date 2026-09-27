import { describe, expect, it } from "vitest";
import { MASTER_PASSWORD_MIN_LENGTH, PasswordHealthPolicy } from "../../src/domain";

describe("MASTER_PASSWORD_MIN_LENGTH", () => {
  it("matches the default health policy's weak-password length", () => {
    expect(MASTER_PASSWORD_MIN_LENGTH).toBe(new PasswordHealthPolicy().minLength);
  });
});
