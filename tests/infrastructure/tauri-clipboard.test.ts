import { describe, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { TauriClipboard } from "../../src/infrastructure/tauri-clipboard";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

describe("TauriClipboard", () => {
  it("writes the given text to the clipboard via the plugin", async () => {
    const clipboard = new TauriClipboard();

    await clipboard.writeText("hunter2");

    expect(writeText).toHaveBeenCalledWith("hunter2");
  });
});
