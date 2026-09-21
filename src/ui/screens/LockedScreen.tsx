import { KeyboardEvent, useState } from "react";
import { Vault } from "../../domain";
import { VaultAccessService } from "../../application/vault-access-service";
import { errorMessage } from "../error-message";
import { ArgusMark } from "../ArgusMark";
import { basename } from "../format";
import { EyeIcon, EyeOffIcon } from "../icons";

interface LockedScreenProps {
  filePath: string;
  vaultAccessService: VaultAccessService;
  onUnlocked: (vault: Vault) => void;
  onChooseDifferentVault: () => void;
}

export function LockedScreen({
  filePath,
  vaultAccessService,
  onUnlocked,
  onChooseDifferentVault,
}: LockedScreenProps) {
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleUnlock() {
    setBusy(true);
    setError(undefined);
    try {
      const vault = await vaultAccessService.openVaultAtPath(filePath, password);
      onUnlocked(vault);
    } catch (cause) {
      setError(errorMessage(cause, "Failed to unlock vault."));
    } finally {
      setBusy(false);
    }
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
