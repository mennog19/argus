import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TauriAutoTyper } from "./tauri-auto-typer";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("TauriAutoTyper", () => {
  it("returns the window the capture command reports", async () => {
    const window = { title: "Sign in — Firefox", processName: "firefox.exe" };
    vi.mocked(invoke).mockResolvedValue(window);

    expect(await new TauriAutoTyper().captureTarget()).toEqual(window);
    expect(invoke).toHaveBeenCalledWith("auto_type_capture_target");
  });

  it("turns the command's null into undefined, matching the port", async () => {
    vi.mocked(invoke).mockResolvedValue(null);

    expect(await new TauriAutoTyper().captureTarget()).toBeUndefined();
  });

  it("sends the steps to the typing command", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const steps = [{ kind: "text", text: "menno" } as const, { kind: "key", key: "tab" } as const];

    await new TauriAutoTyper().typeIntoTarget(steps);

    expect(invoke).toHaveBeenCalledWith("auto_type_send", { steps });
  });
});
