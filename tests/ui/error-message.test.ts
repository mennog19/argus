import { describe, expect, it } from "vitest";
import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("uses an Error's message", () => {
    expect(errorMessage(new Error("Wrong master password."), "fallback")).toBe(
      "Wrong master password.",
    );
  });

  it("uses a rejected string, as Tauri commands report failures", () => {
    expect(errorMessage("forbidden path: C:/vaults/mine.kdbx.bak1", "fallback")).toBe(
      "forbidden path: C:/vaults/mine.kdbx.bak1",
    );
  });

  it("falls back when an Error carries no message", () => {
    expect(errorMessage(new Error("   "), "fallback")).toBe("fallback");
  });

  it("falls back for a blank string", () => {
    expect(errorMessage("  ", "fallback")).toBe("fallback");
  });

  it("falls back for values that are neither", () => {
    expect(errorMessage({ code: 42 }, "fallback")).toBe("fallback");
  });
});
