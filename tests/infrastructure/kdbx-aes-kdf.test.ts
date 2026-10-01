// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Consts, Credentials, Kdbx, ProtectedValue } from "kdbxweb";
import {
  AES_KDF_MAX_ROUNDS,
  aesKdfRounds,
  checkAesKdfLimit,
} from "../../src/infrastructure/kdbx-aes-kdf";
import { configureKdbxCrypto } from "../../src/infrastructure/kdbx-crypto";
import { readKeePassFixture } from "./keepass-fixtures";

interface HeaderField {
  id: number;
  data: Uint8Array;
}

function uint64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

/** A `.kdbx` header with just the fields given, then the end-of-header field. */
function headerBytes(major: 3 | 4, fields: HeaderField[]): ArrayBuffer {
  const sizeBytes = major === 4 ? 4 : 2;
  const all = [...fields, { id: 0, data: new Uint8Array(4) }];
  const length = 12 + all.reduce((total, field) => total + 1 + sizeBytes + field.data.length, 0);
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Consts.Signatures.FileMagic, true);
  view.setUint32(4, Consts.Signatures.Sig2Kdbx, true);
  view.setUint16(10, major, true);
  let offset = 12;
  for (const field of all) {
    view.setUint8(offset, field.id);
    if (major === 4) {
      view.setUint32(offset + 1, field.data.length, true);
    } else {
      view.setUint16(offset + 1, field.data.length, true);
    }
    bytes.set(field.data, offset + 1 + sizeBytes);
    offset += 1 + sizeBytes + field.data.length;
  }
  return bytes.buffer;
}

/** A KDBX 4 KDF dictionary holding `items`, each `[type, key, value]`. */
function dictionary(items: [number, string, Uint8Array][]): Uint8Array {
  const parts: number[] = [0x00, 0x01];
  for (const [type, key, value] of items) {
    const keyBytes = new TextEncoder().encode(key);
    const lengths = new DataView(new ArrayBuffer(8));
    lengths.setUint32(0, keyBytes.length, true);
    lengths.setUint32(4, value.length, true);
    const lengthBytes = new Uint8Array(lengths.buffer);
    parts.push(type, ...lengthBytes.subarray(0, 4), ...keyBytes, ...lengthBytes.subarray(4));
    parts.push(...value);
  }
  parts.push(0);
  return Uint8Array.from(parts);
}

const CIPHER_FIELD: HeaderField = { id: 2, data: new Uint8Array(16) };
const UINT64 = 0x05;
const UINT32 = 0x04;
const BYTES = 0x42;

describe("aesKdfRounds", () => {
  it("reads the transform rounds from a KDBX 3 file KeePass wrote", () => {
    const rounds = aesKdfRounds(readKeePassFixture("kdbx3-aes.kdbx"));

    expect(rounds).toBeGreaterThan(0n);
  });

  it("finds none in a KDBX 4 file keyed with Argon2", () => {
    expect(aesKdfRounds(readKeePassFixture("kdbx4-argon2id.kdbx"))).toBeUndefined();
  });

  it("reads the rounds from a KDBX 4 file keyed with AES-KDF", async () => {
    configureKdbxCrypto();
    const db = Kdbx.create(new Credentials(ProtectedValue.fromString("pw")), "AES");
    db.setKdf(Consts.KdfId.Aes);

    expect(aesKdfRounds(await db.save())).toBe(BigInt(Consts.Defaults.KeyEncryptionRounds));
  });

  it("reads a KDBX 3 round count past the fields before it", () => {
    const bytes = headerBytes(3, [CIPHER_FIELD, { id: 6, data: uint64(2n ** 63n) }]);

    expect(aesKdfRounds(bytes)).toBe(2n ** 63n);
  });

  it("reads a KDBX 4 round count past the dictionary items before it", () => {
    const kdf = dictionary([
      [BYTES, "$UUID", new Uint8Array(16)],
      [UINT64, "R", uint64(123n)],
    ]);

    expect(aesKdfRounds(headerBytes(4, [CIPHER_FIELD, { id: 11, data: kdf }]))).toBe(123n);
  });

  it("ignores an R that isn't the 64-bit number AES-KDF stores", () => {
    const kdf = dictionary([[UINT32, "R", new Uint8Array(4)]]);

    expect(aesKdfRounds(headerBytes(4, [{ id: 11, data: kdf }]))).toBeUndefined();
  });

  it("finds none in a header that has no KDF settings", () => {
    expect(aesKdfRounds(headerBytes(3, [CIPHER_FIELD]))).toBeUndefined();
    expect(aesKdfRounds(headerBytes(4, [CIPHER_FIELD]))).toBeUndefined();
  });

  it("finds none in bytes that aren't a header, rather than throwing", () => {
    expect(aesKdfRounds(new ArrayBuffer(0))).toBeUndefined();
    expect(aesKdfRounds(new TextEncoder().encode("not a kdbx file at all").buffer)).toBeUndefined();
  });
});

describe("checkAesKdfLimit", () => {
  it("accepts a round count at the limit", () => {
    const bytes = headerBytes(3, [{ id: 6, data: uint64(BigInt(AES_KDF_MAX_ROUNDS)) }]);

    expect(() => checkAesKdfLimit(bytes)).not.toThrow();
  });

  it("accepts a file with no AES-KDF rounds", () => {
    expect(() => checkAesKdfLimit(readKeePassFixture("kdbx4-argon2id.kdbx"))).not.toThrow();
  });

  it("refuses a KDBX 3 file asking for more rounds than the limit", () => {
    const bytes = headerBytes(3, [{ id: 6, data: uint64(BigInt(AES_KDF_MAX_ROUNDS) + 1n) }]);

    expect(() => checkAesKdfLimit(bytes)).toThrow(
      "This vault asks for 1,000,000,001 AES-KDF rounds to unlock. Argus allows at most 1,000,000,000.",
    );
  });

  it("refuses a KDBX 4 file asking for more rounds than the limit", () => {
    const kdf = dictionary([[UINT64, "R", uint64(2n ** 64n - 1n)]]);

    expect(() => checkAesKdfLimit(headerBytes(4, [{ id: 11, data: kdf }]))).toThrow(
      "AES-KDF rounds to unlock",
    );
  });
});
