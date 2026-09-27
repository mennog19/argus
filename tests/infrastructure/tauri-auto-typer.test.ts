import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TauriAutoTyper } from "../../src/infrastructure/tauri-auto-typer";

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

  it("returns the form layout the inspect command reports", async () => {
    const layout = { hasUsernameField: true, hasPasswordField: false };
    vi.mocked(invoke).mockResolvedValue(layout);

    expect(await new TauriAutoTyper().inspectTarget()).toEqual(layout);
    expect(invoke).toHaveBeenCalledWith("auto_type_inspect_target");
  });

  it("sends the steps to the typing command", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const steps = [
      { kind: "focus", field: "username" } as const,
      { kind: "text", text: "menno" } as const,
    ];

    await new TauriAutoTyper().typeIntoTarget(steps);

    expect(invoke).toHaveBeenCalledWith("auto_type_send", { steps });
  });
});
