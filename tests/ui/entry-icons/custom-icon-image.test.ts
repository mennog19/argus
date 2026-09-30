import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomIcon } from "../../../src/domain";
import {
  CUSTOM_ICON_MAX_FILE_BYTES,
  customIconUrl,
  iconImageFromFile,
} from "../../../src/ui/entry-icons/custom-icon-image";

describe("customIconUrl", () => {
  it("encodes the icon's bytes as a data URL, once per icon", () => {
    const icon = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000abcd", new Uint8Array([1, 2]));
    const url = customIconUrl(icon);
    expect(url).toBe("data:image/png;base64,AQI=");
    expect(customIconUrl(icon)).toBe(url);
  });

  it("encodes images larger than one chunk", () => {
    const data = new Uint8Array(0x8000 + 3).fill(65);
    const url = customIconUrl(new CustomIcon("id", data));
    expect(atob(url.slice("data:image/png;base64,".length))).toHaveLength(data.length);
  });
});

describe("iconImageFromFile", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  let drawImage: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let canvas: { width: number; height: number };
  let context: object | null;
  let blob: Blob | null;

  function stubBitmap(width: number, height: number) {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width, height, close } as unknown as ImageBitmap),
    );
  }

  beforeEach(() => {
    drawImage = vi.fn();
    close = vi.fn();
    context = { drawImage };
    blob = new Blob([PNG], { type: "image/png" });
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag !== "canvas") {
        return create(tag);
      }
      const element = create("canvas");
      canvas = element;
      element.getContext = (() => context) as unknown as HTMLCanvasElement["getContext"];
      element.toBlob = (callback: BlobCallback) => callback(blob);
      return element;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("scales a large image down to fit 128 pixels and returns PNG bytes", async () => {
    stubBitmap(512, 256);
    const bytes = await iconImageFromFile(new Blob(["x"]));
    expect(Array.from(bytes)).toEqual(Array.from(PNG));
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(64);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 128, 64);
    expect(close).toHaveBeenCalled();
  });

  it("keeps a small image at its own size, never below one pixel", async () => {
    stubBitmap(32, 16);
    await iconImageFromFile(new Blob(["x"]));
    expect([canvas.width, canvas.height]).toEqual([32, 16]);

    stubBitmap(1000, 1);
    await iconImageFromFile(new Blob(["x"]));
    expect([canvas.width, canvas.height]).toEqual([128, 1]);
  });

  it("refuses a file that's far too big to be an icon", async () => {
    const huge = { size: CUSTOM_ICON_MAX_FILE_BYTES + 1 } as Blob;
    await expect(iconImageFromFile(huge)).rejects.toThrow("too large");
  });

  it("explains when the file isn't an image", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode")));
    await expect(iconImageFromFile(new Blob(["x"]))).rejects.toThrow("isn't an image");
  });

  it("fails cleanly when the canvas can't be used", async () => {
    stubBitmap(10, 10);
    context = null;
    await expect(iconImageFromFile(new Blob(["x"]))).rejects.toThrow("Couldn't prepare");
    expect(close).toHaveBeenCalled();
  });

  it("fails cleanly when the image can't be encoded", async () => {
    stubBitmap(10, 10);
    blob = null;
    await expect(iconImageFromFile(new Blob(["x"]))).rejects.toThrow("Couldn't prepare");
  });
});
