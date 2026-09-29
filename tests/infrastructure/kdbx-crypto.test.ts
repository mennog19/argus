// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CryptoEngine } from "kdbxweb";
import { ARGON2_LIMITS, configureKdbxCrypto } from "../../src/infrastructure/kdbx-crypto";

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

  describe("sanity limits on a file's Argon2 settings", () => {
    const argon2 = (memoryKiB: number, iterations: number, parallelism: number) =>
      CryptoEngine.argon2(
        PASSWORD,
        SALT,
        memoryKiB,
        iterations,
        32,
        parallelism,
        CryptoEngine.Argon2TypeArgon2id,
        0x13,
      );

    it("refuses more than 1 GiB of memory, before allocating any of it", async () => {
      configureKdbxCrypto();
      await expect(argon2(ARGON2_LIMITS.memoryKiB + 1024, 1, 1)).rejects.toThrow(
        "This vault asks for 1025 MiB of memory to unlock. Argus allows at most 1024 MiB.",
      );
    });

    it("refuses more iterations than the limit", async () => {
      configureKdbxCrypto();
      await expect(argon2(8, ARGON2_LIMITS.iterations + 1, 1)).rejects.toThrow(
        "This vault asks for 1001 Argon2 iterations to unlock. Argus allows at most 1000.",
      );
    });

    it("refuses more parallelism than the limit", async () => {
      configureKdbxCrypto();
      await expect(argon2(1024, 1, ARGON2_LIMITS.parallelism + 1)).rejects.toThrow(
        "This vault asks for 65 Argon2 lanes to unlock. Argus allows at most 64.",
      );
    });

    it("sets limits far above what KeePass, KeePassXC, and Argus itself use by default", () => {
      expect(ARGON2_LIMITS.memoryKiB).toBe(1024 * 1024);
      expect(ARGON2_LIMITS.iterations).toBe(1000);
      expect(ARGON2_LIMITS.parallelism).toBe(64);
    });
  });
});
