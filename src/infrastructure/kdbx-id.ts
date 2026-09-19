import { KdbxUuid } from "kdbxweb";

const DASHED_HEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Domain ids are dashed-hex UUID strings (`crypto.randomUUID()`); KDBX uuids
 * are raw 16-byte values. Converting through the hex form (rather than
 * treating kdbxweb's own base64 `KdbxUuid.toString()` as the domain id)
 * keeps every id in the app looking like a standard UUID, whether it was
 * created here or loaded from a file.
 */
export function domainIdToKdbxUuid(id: string): KdbxUuid {
  if (!DASHED_HEX_UUID.test(id)) {
    throw new Error(`Not a valid UUID: ${id}`);
  }
  const hex = id.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return new KdbxUuid(bytes.buffer);
}

export function kdbxUuidToDomainId(uuid: KdbxUuid): string {
  const bytes = new Uint8Array(uuid.toBytes());
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
