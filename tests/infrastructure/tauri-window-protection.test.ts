import { describe, expect, it, vi } from "vitest";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TauriWindowProtection } from "./tauri-window-protection";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

describe("TauriWindowProtection", () => {
  it("enables content protection via the underlying window API", async () => {
    const setContentProtected = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getCurrentWindow).mockReturnValue({ setContentProtected } as never);

    await new TauriWindowProtection().setContentProtected(true);

    expect(setContentProtected).toHaveBeenCalledWith(true);
  });

  it("disables content protection via the underlying window API", async () => {
    const setContentProtected = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getCurrentWindow).mockReturnValue({ setContentProtected } as never);

    await new TauriWindowProtection().setContentProtected(false);

    expect(setContentProtected).toHaveBeenCalledWith(false);
  });
});
