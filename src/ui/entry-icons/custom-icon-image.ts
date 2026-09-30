import { CustomIcon } from "../../domain";

/** Uploaded images are scaled down to fit this many pixels a side, as KeePassXC does. */
export const CUSTOM_ICON_MAX_SIZE = 128;

/** Anything bigger is almost certainly not meant as an icon. */
export const CUSTOM_ICON_MAX_FILE_BYTES = 10 * 1024 * 1024;

const urls = new WeakMap<CustomIcon, string>();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked so a large icon doesn't overflow the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * A `data:` URL for the icon's image, as the CSP allows no other source.
 * Icons are nearly always PNG; the WebView sniffs the real format of an
 * image anyway, so the declared type doesn't need to be right for an older
 * KeePass icon stored as, say, ICO or JPEG.
 */
export function customIconUrl(icon: CustomIcon): string {
  let url = urls.get(icon);
  if (url === undefined) {
    url = `data:image/png;base64,${toBase64(icon.data)}`;
    urls.set(icon, url);
  }
  return url;
}

/**
 * Turns an image file the user picked into the PNG bytes stored in the vault,
 * scaled down to fit {@link CUSTOM_ICON_MAX_SIZE}. Re-encoding also means only
 * pixels end up in the file, never whatever else the original carried.
 */
export async function iconImageFromFile(file: Blob): Promise<Uint8Array> {
  if (file.size > CUSTOM_ICON_MAX_FILE_BYTES) {
    throw new Error("That image is too large. Pick one under 10 MB.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn't an image Argus can read.");
  }
  const scale = Math.min(1, CUSTOM_ICON_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Couldn't prepare the image.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) {
    throw new Error("Couldn't prepare the image.");
  }
  return new Uint8Array(await png.arrayBuffer());
}
