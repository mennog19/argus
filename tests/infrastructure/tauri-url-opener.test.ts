import { describe, expect, it, vi } from "vitest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TauriUrlOpener } from "./tauri-url-opener";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

describe("TauriUrlOpener", () => {
  it("opens the given URL via the opener plugin", async () => {
    const opener = new TauriUrlOpener();

    await opener.open("https://example.com");

    expect(openUrl).toHaveBeenCalledWith("https://example.com");
  });
});
