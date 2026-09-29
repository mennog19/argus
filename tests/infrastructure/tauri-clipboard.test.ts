import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TauriClipboard } from "../../src/infrastructure/tauri-clipboard";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("TauriClipboard", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("copies the given text as a secret and returns the copy id", async () => {
    vi.mocked(invoke).mockResolvedValue(42);
    const clipboard = new TauriClipboard();

    const copy = await clipboard.writeText("hunter2");

    expect(invoke).toHaveBeenCalledWith("clipboard_write_secret", { text: "hunter2" });
    expect(copy).toBe(42);
  });

  it("asks for the clipboard to be cleared only if it still holds that copy", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const clipboard = new TauriClipboard();

    await clipboard.clearIfUnchanged(42);

    expect(invoke).toHaveBeenCalledWith("clipboard_clear_secret", { copy: 42 });
  });
});
