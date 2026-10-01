import { vi } from "vitest";
import { VaultFileInfo } from "../../src/application/vault-access-service";
import { DEFAULT_KDF, VaultSettings } from "../../src/application/vault-settings";
import { VaultFileActions } from "../../src/ui/screens/settings/DangerZoneSection";

/** The settings a vault Argus creates starts out with. */
export const NEW_VAULT_SETTINGS: VaultSettings = {
  historyMaxItems: 10,
  historyMaxSizeBytes: 6 * 1024 * 1024,
  kdf: { kind: "argon2id", ...DEFAULT_KDF },
};

/** File info for a password-only KDBX 4 vault, unless `overrides` say otherwise. */
export function fakeFileInfo(overrides: Partial<VaultFileInfo> = {}): VaultFileInfo {
  return {
    sizeBytes: 1024,
    lastModifiedMs: Date.now(),
    format: { major: 4, minor: 1 },
    hasKeyFile: false,
    settings: NEW_VAULT_SETTINGS,
    ...overrides,
  };
}

/** Every vault file action as a mock that succeeds, unless `overrides` replace it. */
export function fakeVaultFileActions(overrides: Partial<VaultFileActions> = {}) {
  return {
    onChangeMasterPassword: vi
      .fn<VaultFileActions["onChangeMasterPassword"]>()
      .mockResolvedValue({ removedBackups: [], unprotectedBackups: [] }),
    onChangeKeyFile: vi
      .fn<VaultFileActions["onChangeKeyFile"]>()
      .mockImplementation((_password, change) =>
        Promise.resolve({
          removedBackups: [],
          unprotectedBackups: [],
          keyFilePath: change.kind === "remove" ? undefined : change.path,
        }),
      ),
    onPickKeyFile: vi.fn<VaultFileActions["onPickKeyFile"]>().mockResolvedValue(undefined),
    onPickNewKeyFilePath: vi
      .fn<VaultFileActions["onPickNewKeyFilePath"]>()
      .mockResolvedValue(undefined),
    onChangeVaultSettings: vi
      .fn<VaultFileActions["onChangeVaultSettings"]>()
      .mockResolvedValue(undefined),
    onUpgradeFormat: vi.fn<VaultFileActions["onUpgradeFormat"]>().mockResolvedValue(undefined),
    ...overrides,
  };
}
