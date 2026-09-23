import { FormEvent, useState } from "react";
import { OpenedVault, VaultAccessService } from "../../application/vault-access-service";
import { RecentVaultEntry } from "../../application/settings";
import { errorMessage } from "../error-message";
import { ArgusMark } from "../ArgusMark";
import { basename, formatRelativeTime } from "../format";

interface WelcomeScreenProps {
  recentVaults: readonly RecentVaultEntry[];
  vaultAccessService: VaultAccessService;
  onOpened: (opened: OpenedVault) => void;
  onSelectRecent: (path: string) => void;
}

type Mode = "idle" | "open" | "create";

export function WelcomeScreen({
  recentVaults,
  vaultAccessService,
  onOpened,
  onSelectRecent,
}: WelcomeScreenProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [openPassword, setOpenPassword] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createConfirmPassword, setCreateConfirmPassword] = useState("");

  function resetToIdle() {
    setMode("idle");
    setError(undefined);
    setOpenPassword("");
    setCreateName("");
    setCreatePassword("");
    setCreateConfirmPassword("");
  }

  async function handleOpenSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const opened = await vaultAccessService.openExistingVault(openPassword);
      if (opened) {
        onOpened(opened);
      }
    } catch (cause) {
      setError(errorMessage(cause, "Failed to open vault."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSubmit(event: FormEvent) {
    event.preventDefault();
    if (createName.trim().length === 0) {
      setError("Vault name is required.");
      return;
    }
    if (createPassword.length === 0) {
      setError("Master password is required.");
      return;
    }
    if (createPassword !== createConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const opened = await vaultAccessService.createNewVault(createName, createPassword);
      if (opened) {
        onOpened(opened);
      }
    } catch (cause) {
      setError(errorMessage(cause, "Failed to create vault."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen-centered">
      <ArgusMark />
      <div className="screen-heading">
        <h1>{mode === "create" ? "Create a new vault" : "Open your vault"}</h1>
        {mode === "idle" && <p>Choose a vault to unlock, or create a new one.</p>}
      </div>

      {mode === "idle" && (
        <div className="screen-panel">
          <button type="button" className="btn-primary" onClick={() => setMode("open")}>
            Open existing vault…
          </button>
          <button type="button" className="btn-secondary" onClick={() => setMode("create")}>
            Create new vault…
          </button>
        </div>
      )}

      {mode === "open" && (
        <form className="screen-panel" onSubmit={(event) => void handleOpenSubmit(event)}>
          <div className="field-group">
            <label className="field-label" htmlFor="open-master-password">
              Master password
            </label>
            <input
              id="open-master-password"
              type="password"
              className="field-input"
              value={openPassword}
              onChange={(event) => setOpenPassword(event.target.value)}
              placeholder="Master password"
            />
          </div>
          {error && <div className="field-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={busy}>
            Choose file & Unlock
          </button>
          <button type="button" className="link-muted" onClick={resetToIdle}>
            Back
          </button>
        </form>
      )}

      {mode === "create" && (
        <form className="screen-panel" onSubmit={(event) => void handleCreateSubmit(event)}>
          <div className="field-group">
            <label className="field-label" htmlFor="create-name">
              Vault name
            </label>
            <input
              id="create-name"
              type="text"
              className="field-input"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="e.g. Personal"
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="create-password">
              Master password
            </label>
            <input
              id="create-password"
              type="password"
              className="field-input"
              value={createPassword}
              onChange={(event) => setCreatePassword(event.target.value)}
              placeholder="Master password"
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="create-confirm-password">
              Confirm password
            </label>
            <input
              id="create-confirm-password"
              type="password"
              className="field-input"
              value={createConfirmPassword}
              onChange={(event) => setCreateConfirmPassword(event.target.value)}
              placeholder="Confirm password"
            />
          </div>
          {error && <div className="field-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={busy}>
            Choose location & Create
          </button>
          <button type="button" className="link-muted" onClick={resetToIdle}>
            Back
          </button>
        </form>
      )}

      {mode === "idle" && recentVaults.length > 0 && (
        <div className="recent-vaults">
          <div className="recent-vaults-label">Recent vaults</div>
          {recentVaults.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="recent-vault-row"
              onClick={() => onSelectRecent(entry.path)}
            >
              <span className="recent-vault-name">{basename(entry.path)}</span>
              <span className="recent-vault-meta">{formatRelativeTime(entry.lastOpenedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
