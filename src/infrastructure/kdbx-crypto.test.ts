// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CryptoEngine } from "kdbxweb";
import { configureKdbxCrypto } from "./kdbx-crypto";

const PASSWORD = new TextEncoder().encode("correct horse battery staple").buffer;
const SALT = new Uint8Array(32).fill(7).buffer;

describe("configureKdbxCrypto", () => {
  it("registers an Argon2id implementation that produces a hash of the requested length", async () => {
    configureKdbxCrypto();
    const hash = await CryptoEngine.argon2(
      PASSWORD,
      SALT,
      8,
      1,
      32,
      1,
      CryptoEngine.Argon2TypeArgon2id,
      0x13,
    );
    expect(hash.byteLength).toBe(32);
  });

  it("registers an Argon2d implementation as well", async () => {
    configureKdbxCrypto();
    const hash = await CryptoEngine.argon2(
      PASSWORD,
      SALT,
      8,
      1,
      32,
      1,
      CryptoEngine.Argon2TypeArgon2d,
      0x13,
    );
    expect(hash.byteLength).toBe(32);
  });

  it("is idempotent across repeated calls", async () => {
    configureKdbxCrypto();
    configureKdbxCrypto();
    const hash = await CryptoEngine.argon2(
      PASSWORD,
      SALT,
      8,
      1,
      32,
      1,
      CryptoEngine.Argon2TypeArgon2id,
      0x13,
    );
    expect(hash.byteLength).toBe(32);
  });

  it("rejects Argon2 versions hash-wasm can't honor", async () => {
    configureKdbxCrypto();
    await expect(
      CryptoEngine.argon2(PASSWORD, SALT, 8, 1, 32, 1, CryptoEngine.Argon2TypeArgon2id, 0x10),
    ).rejects.toThrow("Unsupported Argon2 version: 0x10");
  });
});
