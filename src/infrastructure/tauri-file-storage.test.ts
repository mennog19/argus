import { describe, expect, it, vi } from "vitest";
import { copyFile, exists, readFile, stat, writeFile } from "@tauri-apps/plugin-fs";
import { TauriFileStorage } from "./tauri-file-storage";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
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

  it("writes an ArrayBuffer to a file", async () => {
    const data = new Uint8Array([5, 6, 7, 8]).buffer;
    const storage = new TauriFileStorage();

    await storage.writeFile("C:/vaults/new.kdbx", data);

    expect(writeFile).toHaveBeenCalledWith("C:/vaults/new.kdbx", new Uint8Array(data));
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

  it("copies a file to a new path", async () => {
    const storage = new TauriFileStorage();

    await storage.copyFile("C:/vaults/mine.kdbx", "C:/vaults/mine.kdbx.bak1");

    expect(copyFile).toHaveBeenCalledWith("C:/vaults/mine.kdbx", "C:/vaults/mine.kdbx.bak1");
  });
});
