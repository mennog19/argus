const MIB = 1024 * 1024;

/**
 * How a vault turns its master key into the key that encrypts the file.
 * KDBX 4 can use any of the three; KDBX 3 only has AES-KDF.
 */
export type VaultKdf =
  | {
      readonly kind: "argon2id" | "argon2d";
      readonly memoryBytes: number;
      readonly iterations: number;
      readonly parallelism: number;
    }
  | { readonly kind: "aes"; readonly rounds: number };

export type VaultKdfKind = VaultKdf["kind"];

/**
 * The settings a vault file carries about itself, as opposed to the app
 * settings in `settings.ts`: they travel with the file, and KeePass and
 * KeePassXC read and honour the same ones.
 */
export interface VaultSettings {
  /** Most history revisions kept per entry. `undefined` keeps every one. */
  readonly historyMaxItems: number | undefined;
  /** Most bytes of history kept per entry. `undefined` means no limit. */
  readonly historyMaxSizeBytes: number | undefined;
  readonly kdf: VaultKdf;
}

/**
 * Argon2id settings for vaults Argus creates, and what a vault gets when it
 * moves to Argon2 from AES-KDF.
 * kdbxweb's own defaults are Argon2d with 1 MiB / 2 iterations, far too cheap
 * to slow down an offline guessing attack. These cost ~0.5s in hash-wasm's
 * single-threaded WASM Argon2 — paid on every unlock and every save.
 */
export const DEFAULT_KDF = {
  memoryBytes: 64 * MIB,
  iterations: 4,
  parallelism: 2,
} as const;

/**
 * The most key-derivation work Argus will do to unlock a file, and so also
 * the most it lets a vault be set to. The KDF settings come from the file's
 * unencrypted header, so a crafted or corrupted `.kdbx` can ask for gigabytes
 * of memory — enough to crash the webview — or effectively endless iterations
 * or rounds. Each limit is far above anything KeePass, KeePassXC, or Argus's
 * own defaults would write: KeePass's AES-KDF default is 60,000 rounds and
 * KeePassXC's one-second benchmark lands in the tens of millions.
 */
export const KDF_LIMITS = {
  argon2MinMemoryBytes: MIB,
  argon2MaxMemoryBytes: 1024 * MIB,
  argon2MaxIterations: 1000,
  argon2MaxParallelism: 64,
  aesMaxRounds: 1_000_000_000,
} as const;

function isWholeNumberBetween(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function historyLimitError(value: number | undefined, label: string): string | undefined {
  if (value === undefined || isWholeNumberBetween(value, 0, Number.MAX_SAFE_INTEGER)) {
    return undefined;
  }
  return `${label} must be a whole number, or left blank for no limit.`;
}

function kdfError(kdf: VaultKdf): string | undefined {
  if (kdf.kind === "aes") {
    return isWholeNumberBetween(kdf.rounds, 1, KDF_LIMITS.aesMaxRounds)
      ? undefined
      : `AES-KDF rounds must be between 1 and ${KDF_LIMITS.aesMaxRounds.toLocaleString("en-US")}.`;
  }
  const { argon2MinMemoryBytes, argon2MaxMemoryBytes, argon2MaxIterations, argon2MaxParallelism } =
    KDF_LIMITS;
  if (!isWholeNumberBetween(kdf.memoryBytes, argon2MinMemoryBytes, argon2MaxMemoryBytes)) {
    return `Memory must be between ${argon2MinMemoryBytes / MIB} and ${argon2MaxMemoryBytes / MIB} MiB.`;
  }
  if (!isWholeNumberBetween(kdf.iterations, 1, argon2MaxIterations)) {
    return `Iterations must be between 1 and ${argon2MaxIterations}.`;
  }
  if (!isWholeNumberBetween(kdf.parallelism, 1, argon2MaxParallelism)) {
    return `Parallelism must be between 1 and ${argon2MaxParallelism}.`;
  }
  return undefined;
}

/**
 * Why `settings` can't be applied to a vault, written for the user, or
 * `undefined` when they're fine. Everything it accepts is something Argus
 * will also unlock again afterwards.
 */
export function vaultSettingsError(settings: VaultSettings): string | undefined {
  return (
    historyLimitError(settings.historyMaxItems, "History revisions") ??
    historyLimitError(settings.historyMaxSizeBytes, "History size") ??
    kdfError(settings.kdf)
  );
}
