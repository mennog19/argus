import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TauriWindowCloseBehavior } from "../../src/infrastructure/tauri-window-close-behavior";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("TauriWindowCloseBehavior", () => {
  it.each([true, false])("passes close-to-tray = %s to the backend", async (enabled) => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await new TauriWindowCloseBehavior().setCloseToTray(enabled);

    expect(invoke).toHaveBeenCalledWith("set_close_to_tray", { enabled });
  });
});
