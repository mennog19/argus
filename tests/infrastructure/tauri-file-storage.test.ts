import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { copyFile, exists, readFile, stat } from "@tauri-apps/plugin-fs";
import { TauriFileStorage } from "../../src/infrastructure/tauri-file-storage";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  exists: vi.fn(),
  stat: vi.fn(),
  copyFile: vi.fn(),
}));

describe("TauriFileStorage", () => {
  it("reads a file as an ArrayBuffer", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.mocked(readFile).mockResolvedValue(bytes);
    const storage = new TauriFileStorage();

    const result = await storage.readFile("C:/vaults/mine.kdbx");

    expect(readFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx");
    expect(new Uint8Array(result)).toEqual(bytes);
  });

  it("reads a file backed by a larger underlying buffer without including surrounding bytes", async () => {
    const buffer = new ArrayBuffer(10);
    const bytes = new Uint8Array(buffer, 2, 4);
    bytes.set([9, 8, 7, 6]);
    vi.mocked(readFile).mockResolvedValue(bytes);
    const storage = new TauriFileStorage();

    const result = await storage.readFile("C:/vaults/mine.kdbx");

    expect(new Uint8Array(result)).toEqual(new Uint8Array([9, 8, 7, 6]));
  });

  it("writes an ArrayBuffer to a file through the atomic-write command", async () => {
    const data = new Uint8Array([5, 6, 7, 8]).buffer;
    const storage = new TauriFileStorage();

    await storage.writeFile("C:/vaults/new.kdbx", data);

    expect(invoke).toHaveBeenCalledWith("write_file_atomic", new Uint8Array(data), {
      headers: { path: encodeURIComponent("C:/vaults/new.kdbx") },
    });
  });

  it("percent-encodes the path so non-ASCII vault locations survive the header", async () => {
    const storage = new TauriFileStorage();

    await storage.writeFile("C:/Users/Renée/wachtwoorden.kdbx", new ArrayBuffer(0));

    expect(invoke).toHaveBeenCalledWith("write_file_atomic", expect.anything(), {
      headers: { path: "C%3A%2FUsers%2FRen%C3%A9e%2Fwachtwoorden.kdbx" },
    });
  });

  it("reports whether a file exists", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    const storage = new TauriFileStorage();

    const result = await storage.exists("C:/vaults/mine.kdbx");

    expect(exists).toHaveBeenCalledWith("C:/vaults/mine.kdbx");
    expect(result).toBe(true);
  });

  it("returns a file's last-modified time in epoch milliseconds", async () => {
    const mtime = new Date("2026-01-01T00:00:00.000Z");
    vi.mocked(stat).mockResolvedValue({ mtime } as Awaited<ReturnType<typeof stat>>);
    const storage = new TauriFileStorage();

    const result = await storage.lastModified("C:/vaults/mine.kdbx");

    expect(stat).toHaveBeenCalledWith("C:/vaults/mine.kdbx");
    expect(result).toBe(mtime.getTime());
  });

  it("falls back to 0 when the platform reports no mtime", async () => {
    vi.mocked(stat).mockResolvedValue({ mtime: null } as Awaited<ReturnType<typeof stat>>);
    const storage = new TauriFileStorage();

    const result = await storage.lastModified("C:/vaults/mine.kdbx");

    expect(result).toBe(0);
  });

  it("returns a file's size in bytes", async () => {
    vi.mocked(stat).mockResolvedValue({ size: 49152 } as Awaited<ReturnType<typeof stat>>);
    const storage = new TauriFileStorage();

    const result = await storage.size("C:/vaults/mine.kdbx");

    expect(stat).toHaveBeenCalledWith("C:/vaults/mine.kdbx");
    expect(result).toBe(49152);
  });

  it("copies a file to a new path", async () => {
    const storage = new TauriFileStorage();

    await storage.copyFile("C:/vaults/mine.kdbx", "C:/vaults/mine.kdbx.bak1");

    expect(copyFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx", "C:/vaults/mine.kdbx.bak1");
  });

  it("grants filesystem access to a path through the app's own command", async () => {
    const storage = new TauriFileStorage();

    await storage.grantAccess("C:/vaults/mine.kdbx.bak1");

    expect(invoke).toHaveBeenCalledWith("grant_file_access", {
      path: "C:/vaults/mine.kdbx.bak1",
    });
  });
});
