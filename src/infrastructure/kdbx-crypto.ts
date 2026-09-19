import { CryptoEngine } from "kdbxweb";
import { argon2d, argon2id } from "hash-wasm";

const SUPPORTED_ARGON2_VERSION = 0x13;

let configured = false;

/**
 * kdbxweb ships no Argon2 implementation (it's a ~130kB library that leaves
 * KDF hashing to the host app) but KDBX4's default KDF is Argon2d/Argon2id,
 * so without this, real KeePass/KeePassXC files fail to open. hash-wasm is
 * WASM-based and pinned to Argon2 v1.3 (0x13) internally, so v1.0 files
 * (0x10) can't be honored and must fail loudly rather than derive a silently
 * wrong key.
 */
export function configureKdbxCrypto(): void {
  if (configured) {
    return;
  }
  configured = true;

  CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type, version) => {
    if (version !== SUPPORTED_ARGON2_VERSION) {
      throw new Error(`Unsupported Argon2 version: 0x${version.toString(16)}`);
    }
    const hash = type === CryptoEngine.Argon2TypeArgon2id ? argon2id : argon2d;
    const result = await hash({
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      iterations,
      parallelism,
      memorySize: memory,
      hashLength: length,
      outputType: "binary",
    });
    return Uint8Array.from(result).buffer;
  });
}
