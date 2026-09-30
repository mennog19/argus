import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TauriUpdater } from "../../src/infrastructure/tauri-updater";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  // Keeps the handler so the test can play the backend's progress messages.
  Channel: class {
    constructor(readonly onmessage: (message: unknown) => void) {}
  },
}));

/** The progress channel `installUpdate` handed to the backend. */
function sentChannel(): { onmessage: (message: unknown) => void } {
  const [, args] = vi.mocked(invoke).mock.calls[0];
  return (args as { onProgress: { onmessage: (message: unknown) => void } }).onProgress;
}

describe("TauriUpdater", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  describe("checkForUpdate", () => {
    it("resolves to undefined when Argus is up to date", async () => {
      vi.mocked(invoke).mockResolvedValue(null);

      await expect(new TauriUpdater().checkForUpdate()).resolves.toBeUndefined();
      expect(invoke).toHaveBeenCalledWith("check_for_update");
    });

    it("resolves to the newer version and its notes", async () => {
      vi.mocked(invoke).mockResolvedValue({
        version: "0.2.0",
        currentVersion: "0.1.0",
        notes: "Faster unlock.",
      });

      await expect(new TauriUpdater().checkForUpdate()).resolves.toStrictEqual({
        version: "0.2.0",
        currentVersion: "0.1.0",
        notes: "Faster unlock.",
      });
    });

    it("leaves notes out when the release has none", async () => {
      vi.mocked(invoke).mockResolvedValue({
        version: "0.2.0",
        currentVersion: "0.1.0",
        notes: null,
      });

      await expect(new TauriUpdater().checkForUpdate()).resolves.toStrictEqual({
        version: "0.2.0",
        currentVersion: "0.1.0",
      });
    });

    it("passes on a failed check", async () => {
      vi.mocked(invoke).mockRejectedValue("offline");

      await expect(new TauriUpdater().checkForUpdate()).rejects.toBe("offline");
    });
  });

  describe("installUpdate", () => {
    it("asks the backend to install and reports its download progress", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);
      const onProgress = vi.fn();

      await new TauriUpdater().installUpdate(onProgress);
      const channel = sentChannel();
      channel.onmessage({ downloaded: 512, total: 2048 });
      channel.onmessage({ downloaded: 1024, total: null });

      expect(invoke).toHaveBeenCalledWith("install_update", { onProgress: channel });
      expect(onProgress).toHaveBeenNthCalledWith(1, { downloadedBytes: 512, totalBytes: 2048 });
      expect(onProgress).toHaveBeenNthCalledWith(2, { downloadedBytes: 1024 });
    });

    it("passes on a failed install", async () => {
      vi.mocked(invoke).mockRejectedValue("bad signature");

      await expect(new TauriUpdater().installUpdate(vi.fn())).rejects.toBe("bad signature");
    });
  });
});
