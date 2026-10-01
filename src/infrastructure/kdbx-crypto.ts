import { CryptoEngine } from "kdbxweb";
import { argon2d, argon2id } from "hash-wasm";
import { KDF_LIMITS } from "../application/vault-settings";

const SUPPORTED_ARGON2_VERSION = 0x13;

/**
 * The most Argon2 work Argus will do to unlock a file, in the units kdbxweb
 * hands the settings over in. See `KDF_LIMITS` for why there is a limit.
 */
export const ARGON2_LIMITS = {
  memoryKiB: KDF_LIMITS.argon2MaxMemoryBytes / 1024,
  iterations: KDF_LIMITS.argon2MaxIterations,
  parallelism: KDF_LIMITS.argon2MaxParallelism,
} as const;

function checkArgon2Limits(memoryKiB: number, iterations: number, parallelism: number): void {
  if (memoryKiB > ARGON2_LIMITS.memoryKiB) {
    const toMiB = (kib: number) => Math.ceil(kib / 1024);
    throw new Error(
      `This vault asks for ${toMiB(memoryKiB)} MiB of memory to unlock. ` +
        `Argus allows at most ${toMiB(ARGON2_LIMITS.memoryKiB)} MiB.`,
    );
  }
  if (iterations > ARGON2_LIMITS.iterations) {
    throw new Error(
      `This vault asks for ${iterations} Argon2 iterations to unlock. ` +
        `Argus allows at most ${ARGON2_LIMITS.iterations}.`,
    );
  }
  if (parallelism > ARGON2_LIMITS.parallelism) {
    throw new Error(
      `This vault asks for ${parallelism} Argon2 lanes to unlock. ` +
        `Argus allows at most ${ARGON2_LIMITS.parallelism}.`,
    );
  }
}

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

  CryptoEngine.setArgon2Impl(
    async (password, salt, memory, iterations, length, parallelism, type, version) => {
      if (version !== SUPPORTED_ARGON2_VERSION) {
        throw new Error(`Unsupported Argon2 version: 0x${version.toString(16)}`);
      }
      // `memory` arrives in KiB — kdbxweb has already divided the header's
      // byte count down — and is checked before hash-wasm allocates any of it.
      checkArgon2Limits(memory, iterations, parallelism);
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
    },
  );
}
