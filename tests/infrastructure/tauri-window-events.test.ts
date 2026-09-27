import { describe, expect, it, vi } from "vitest";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TauriWindowEvents } from "./tauri-window-events";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeWindow(isMinimized: () => Promise<boolean> = () => Promise.resolve(false)) {
  const unlisten = vi.fn();
  const onResized = vi.fn().mockResolvedValue(unlisten);
  const window = { onResized, isMinimized: vi.fn(isMinimized) };
  vi.mocked(getCurrentWindow).mockReturnValue(window as never);
  return { window, unlisten };
}

describe("TauriWindowEvents", () => {
  it("calls the callback when a resize leaves the window minimized", async () => {
    const { window } = fakeWindow(() => Promise.resolve(true));
    const callback = vi.fn();

    new TauriWindowEvents().onMinimize(callback);
    const resizeHandler = window.onResized.mock.calls[0][0];
    resizeHandler();
    await flush();
    await flush();

    expect(callback).toHaveBeenCalled();
  });

  it("does not call the callback when a resize leaves the window not minimized", async () => {
    const { window } = fakeWindow(() => Promise.resolve(false));
    const callback = vi.fn();

    new TauriWindowEvents().onMinimize(callback);
    const resizeHandler = window.onResized.mock.calls[0][0];
    resizeHandler();
    await flush();
    await flush();

    expect(callback).not.toHaveBeenCalled();
  });

  it("unsubscribes via the underlying unlisten function once registration has resolved", async () => {
    const { unlisten } = fakeWindow();

    const unsubscribe = new TauriWindowEvents().onMinimize(vi.fn());
    await flush();
    unsubscribe();

    expect(unlisten).toHaveBeenCalled();
  });

  it("unsubscribes as soon as registration resolves, even if called beforehand", async () => {
    const { unlisten } = fakeWindow();

    const unsubscribe = new TauriWindowEvents().onMinimize(vi.fn());
    unsubscribe();
    await flush();

    expect(unlisten).toHaveBeenCalled();
  });
});
