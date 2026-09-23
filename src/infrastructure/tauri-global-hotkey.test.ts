import { describe, expect, it, vi } from "vitest";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { TauriGlobalHotkey } from "./tauri-global-hotkey";

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: vi.fn(),
  unregister: vi.fn(),
}));

/** Replays what the plugin hands the handler for one press-and-release. */
function pressAndRelease() {
  const handler = vi.mocked(register).mock.calls[0][1];
  handler({ shortcut: "CommandOrControl+Shift+A", id: 1, state: "Pressed" });
  handler({ shortcut: "CommandOrControl+Shift+A", id: 1, state: "Released" });
}

describe("TauriGlobalHotkey", () => {
  it("registers the accelerator with the plugin", async () => {
    await new TauriGlobalHotkey().register("CommandOrControl+Shift+A", vi.fn());

    expect(register).toHaveBeenCalledWith("CommandOrControl+Shift+A", expect.any(Function));
  });

  it("fires the handler once per press, not again on release", async () => {
    const handler = vi.fn();
    await new TauriGlobalHotkey().register("CommandOrControl+Shift+A", handler);

    pressAndRelease();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("releases the previous accelerator before claiming a new one", async () => {
    const hotkey = new TauriGlobalHotkey();
    await hotkey.register("CommandOrControl+Shift+A", vi.fn());

    await hotkey.register("Alt+Space", vi.fn());

    expect(unregister).toHaveBeenCalledWith("CommandOrControl+Shift+A");
    expect(register).toHaveBeenLastCalledWith("Alt+Space", expect.any(Function));
  });

  it("does nothing when unregistering while nothing is bound", async () => {
    await new TauriGlobalHotkey().unregister();

    expect(unregister).not.toHaveBeenCalled();
  });

  it("releases what it holds", async () => {
    const hotkey = new TauriGlobalHotkey();
    await hotkey.register("Alt+Space", vi.fn());

    await hotkey.unregister();

    expect(unregister).toHaveBeenCalledWith("Alt+Space");
  });

  it("waits for a pending release before claiming the next accelerator", async () => {
    const hotkey = new TauriGlobalHotkey();
    await hotkey.register("Alt+Space", vi.fn());
    vi.mocked(register).mockClear();

    let finishRelease!: () => void;
    vi.mocked(unregister).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRelease = resolve;
      }),
    );

    // What re-binding looks like from a React effect: the cleanup releases
    // without awaiting, and the next effect immediately re-claims the same
    // combination. Run concurrently, the release lands last and hands back a
    // shortcut Argus has just re-taken.
    const released = hotkey.unregister();
    const reclaimed = hotkey.register("Alt+Space", vi.fn());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(register).not.toHaveBeenCalled();

    finishRelease();
    await Promise.all([released, reclaimed]);

    expect(register).toHaveBeenCalledWith("Alt+Space", expect.any(Function));
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("forgets the binding even when the plugin fails to release it", async () => {
    const hotkey = new TauriGlobalHotkey();
    await hotkey.register("Alt+Space", vi.fn());
    vi.mocked(unregister).mockRejectedValueOnce(new Error("not registered"));

    await expect(hotkey.unregister()).rejects.toThrow("not registered");
    await hotkey.unregister();

    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
