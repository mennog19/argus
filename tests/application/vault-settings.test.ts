import { describe, expect, it } from "vitest";
import {
  DEFAULT_KDF,
  KDF_LIMITS,
  VaultKdf,
  VaultSettings,
  vaultSettingsError,
} from "../../src/application/vault-settings";
import { AES_KDF_MAX_ROUNDS } from "../../src/infrastructure/kdbx-aes-kdf";
import { ARGON2_LIMITS } from "../../src/infrastructure/kdbx-crypto";

const MIB = 1024 * 1024;
const ARGON2: VaultKdf = { kind: "argon2id", ...DEFAULT_KDF };

function settings(overrides: Partial<VaultSettings> = {}): VaultSettings {
  return { historyMaxItems: 10, historyMaxSizeBytes: 6 * MIB, kdf: ARGON2, ...overrides };
}

describe("vaultSettingsError", () => {
  it("accepts the settings a new vault gets", () => {
    expect(vaultSettingsError(settings())).toBeUndefined();
  });

  it("accepts unlimited history, and none at all", () => {
    expect(
      vaultSettingsError(settings({ historyMaxItems: undefined, historyMaxSizeBytes: undefined })),
    ).toBeUndefined();
    expect(
      vaultSettingsError(settings({ historyMaxItems: 0, historyMaxSizeBytes: 0 })),
    ).toBeUndefined();
  });

  it.each([-1, 1.5, Number.NaN])("rejects %s history revisions", (historyMaxItems) => {
    expect(vaultSettingsError(settings({ historyMaxItems }))).toBe(
      "History revisions must be a whole number, or left blank for no limit.",
    );
  });

  it("rejects a history size that isn't a whole number of bytes", () => {
    expect(vaultSettingsError(settings({ historyMaxSizeBytes: -5 }))).toBe(
      "History size must be a whole number, or left blank for no limit.",
    );
  });

  it("accepts Argon2 settings at each limit", () => {
    const kdf: VaultKdf = {
      kind: "argon2d",
      memoryBytes: KDF_LIMITS.argon2MaxMemoryBytes,
      iterations: KDF_LIMITS.argon2MaxIterations,
      parallelism: KDF_LIMITS.argon2MaxParallelism,
    };

    expect(vaultSettingsError(settings({ kdf }))).toBeUndefined();
    expect(
      vaultSettingsError(
        settings({ kdf: { kind: "argon2id", memoryBytes: MIB, iterations: 1, parallelism: 1 } }),
      ),
    ).toBeUndefined();
  });

  it.each([MIB - 1, 1025 * MIB, 1.5 * MIB + 0.5])("rejects %s bytes of Argon2 memory", (memory) => {
    expect(vaultSettingsError(settings({ kdf: { ...ARGON2, memoryBytes: memory } }))).toBe(
      "Memory must be between 1 and 1024 MiB.",
    );
  });

  it.each([0, 1001, 2.5])("rejects %s Argon2 iterations", (iterations) => {
    expect(vaultSettingsError(settings({ kdf: { ...ARGON2, iterations } }))).toBe(
      "Iterations must be between 1 and 1000.",
    );
  });

  it.each([0, 65])("rejects %s Argon2 lanes", (parallelism) => {
    expect(vaultSettingsError(settings({ kdf: { ...ARGON2, parallelism } }))).toBe(
      "Parallelism must be between 1 and 64.",
    );
  });

  it("accepts AES-KDF rounds up to the limit and rejects more, or none", () => {
    const aes = (rounds: number) => settings({ kdf: { kind: "aes", rounds } });

    expect(vaultSettingsError(aes(1))).toBeUndefined();
    expect(vaultSettingsError(aes(KDF_LIMITS.aesMaxRounds))).toBeUndefined();
    expect(vaultSettingsError(aes(KDF_LIMITS.aesMaxRounds + 1))).toBe(
      "AES-KDF rounds must be between 1 and 1,000,000,000.",
    );
    expect(vaultSettingsError(aes(0))).toBe("AES-KDF rounds must be between 1 and 1,000,000,000.");
  });

  it("reports the history problem first when several things are wrong", () => {
    expect(
      vaultSettingsError(settings({ historyMaxItems: -1, kdf: { kind: "aes", rounds: 0 } })),
    ).toContain("History revisions");
  });
});

describe("KDF_LIMITS", () => {
  // Otherwise a vault could be saved with settings Argus then refuses to unlock.
  it("lets a vault be set to nothing more than Argus will unlock", () => {
    expect(KDF_LIMITS.argon2MaxMemoryBytes / 1024).toBe(ARGON2_LIMITS.memoryKiB);
    expect(KDF_LIMITS.argon2MaxIterations).toBe(ARGON2_LIMITS.iterations);
    expect(KDF_LIMITS.argon2MaxParallelism).toBe(ARGON2_LIMITS.parallelism);
    expect(KDF_LIMITS.aesMaxRounds).toBe(AES_KDF_MAX_ROUNDS);
  });
});
