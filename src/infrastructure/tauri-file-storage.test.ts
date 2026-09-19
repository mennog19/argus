import { describe, expect, it, vi } from "vitest";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { TauriFileStorage } from "./tauri-file-storage";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
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
});
