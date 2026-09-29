import { KeyboardEvent, useState } from "react";
import { Vault } from "../../domain";
import { VaultAccessService } from "../../application/vault-access-service";
import { useAsyncAction } from "../use-async-action";
import { ArgusMark } from "../ArgusMark";
import { basename } from "../format";
import { EyeIcon, EyeOffIcon } from "../icons";
import { KeyFileField } from "./KeyFileField";

interface LockedScreenProps {
  filePath: string;
  /** The key file this vault was last unlocked with, pre-selected if any. */
  initialKeyFilePath?: string;
  vaultAccessService: VaultAccessService;
  onUnlocked: (vault: Vault, keyFilePath: string | undefined) => void;
  onChooseDifferentVault: () => void;
}

export function LockedScreen({
  filePath,
  initialKeyFilePath,
  vaultAccessService,
  onUnlocked,
  onChooseDifferentVault,
}: LockedScreenProps) {
  const [password, setPassword] = useState("");
  const [keyFilePath, setKeyFilePath] = useState(initialKeyFilePath);
  const [revealed, setRevealed] = useState(false);
  const { busy, error, run } = useAsyncAction();

  async function handleUnlock() {
    await run(async () => {
      const vault = await vaultAccessService.openVaultAtPath(filePath, password, keyFilePath);
      onUnlocked(vault, keyFilePath);
    }, "Failed to unlock vault.");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      void handleUnlock();
    }
  }

  return (
    <div className="screen-centered">
      <ArgusMark state={busy ? "focusing" : "watching"} />
      <div className="screen-heading">
        <h1>Unlock your vault</h1>
        <p>{basename(filePath)}</p>
      </div>
      <div className="screen-panel">
        <div className="field-input-with-action">
          <input
            type={revealed ? "text" : "password"}
            className="field-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Master password"
            aria-label="Master password"
            autoFocus
          />
          <button
            type="button"
            className="field-reveal-button"
            aria-label={revealed ? "Hide password" : "Show password"}
            title={revealed ? "Hide password" : "Show password"}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        </div>
        <KeyFileField
          keyFilePath={keyFilePath}
          onPick={() => vaultAccessService.pickKeyFile()}
          onChange={setKeyFilePath}
          disabled={busy}
        />
        {error && <div className="field-error">{error}</div>}
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleUnlock()}
          disabled={busy}
        >
          Unlock
        </button>
        <button type="button" className="link-muted" onClick={onChooseDifferentVault}>
          Choose a different vault…
        </button>
      </div>
    </div>
  );
}
