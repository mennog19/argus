import { useState } from "react";
import { Vault } from "../../../domain";
import { VaultMergeSource } from "../../../application/vault-merge-source";
import { isSamePath } from "../../format";

export interface MergeFlow {
  /** The picked file, from the moment it's chosen until the merge is closed. */
  readonly filePath: string | undefined;
  /** The picked vault once unlocked — the wizard only opens when this is set. */
  readonly sourceVault: Vault | undefined;
  /** Why the last attempt never got started, e.g. the picked file is this vault. */
  readonly error: string | undefined;
  /** Asks for a file to merge in; the unlock dialog follows if one is picked. */
  start(): Promise<void>;
  unlocked(sourceVault: Vault): void;
  cancelUnlock(): void;
  /** Abandons any in-progress merge. */
  reset(): void;
}

export function useMergeFlow(mergeSource: VaultMergeSource, openFilePath: string): MergeFlow {
  const [filePath, setFilePath] = useState<string | undefined>(undefined);
  const [sourceVault, setSourceVault] = useState<Vault | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  return {
    filePath,
    sourceVault,
    error,
    start: async () => {
      setError(undefined);
      const picked = await mergeSource.pickFile();
      if (!picked) {
        return;
      }
      // Merging a vault into itself would compare every entry against its own
      // twin and, entry by entry, offer to overwrite it with itself — nothing
      // useful, and plenty to get wrong. Refuse it before asking for a password.
      if (isSamePath(picked, openFilePath)) {
        setError(
          "That's the vault you already have open. Pick a different .kdbx file to merge in.",
        );
        return;
      }
      setFilePath(picked);
    },
    unlocked: setSourceVault,
    cancelUnlock: () => setFilePath(undefined),
    reset: () => {
      setFilePath(undefined);
      setSourceVault(undefined);
      setError(undefined);
    },
  };
}
