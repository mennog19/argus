import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TauriVaultOpenRequests } from "../../src/infrastructure/tauri-vault-open-requests";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeBackend(launchVaultPath: string | null) {
  vi.mocked(invoke).mockReset().mockResolvedValue(launchVaultPath);
  const unlisten = vi.fn();
  vi.mocked(listen).mockReset().mockResolvedValue(unlisten);
  return { unlisten };
}

describe("TauriVaultOpenRequests", () => {
  it("hands over the vault Argus was launched with", async () => {
    fakeBackend("C:/vaults/launched.kdbx");
    const callback = vi.fn();

    new TauriVaultOpenRequests().onOpenRequest(callback);
    await flush();

    expect(invoke).toHaveBeenCalledWith("launch_vault_path");
    expect(callback).toHaveBeenCalledWith("C:/vaults/launched.kdbx");
  });

  it("hands over nothing when Argus was launched without a vault", async () => {
    fakeBackend(null);
    const callback = vi.fn();

    new TauriVaultOpenRequests().onOpenRequest(callback);
    await flush();

    expect(callback).not.toHaveBeenCalled();
  });

  it("drops the launch vault when unsubscribed before the backend answers", async () => {
    fakeBackend("C:/vaults/launched.kdbx");
    const callback = vi.fn();

    const unsubscribe = new TauriVaultOpenRequests().onOpenRequest(callback);
    unsubscribe();
    await flush();

    expect(callback).not.toHaveBeenCalled();
  });

  it("hands over a vault the backend asks to open while running", () => {
    fakeBackend(null);
    const callback = vi.fn();

    new TauriVaultOpenRequests().onOpenRequest(callback);
    const [eventName, handler] = vi.mocked(listen).mock.calls[0];
    handler({ event: eventName, id: 1, payload: "C:/vaults/other.kdbx" });

    expect(eventName).toBe("open-vault");
    expect(callback).toHaveBeenCalledWith("C:/vaults/other.kdbx");
  });

  it("stops listening when unsubscribed", async () => {
    const { unlisten } = fakeBackend(null);

    const unsubscribe = new TauriVaultOpenRequests().onOpenRequest(vi.fn());
    await flush();
    unsubscribe();

    expect(unlisten).toHaveBeenCalled();
  });
});
