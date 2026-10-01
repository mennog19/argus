import { FormEvent, useState } from "react";
import { OpenedVault, VaultAccessService } from "../../application/vault-access-service";
import { RecentVaultEntry } from "../../application/settings";
import { MASTER_PASSWORD_HINT, masterPasswordRuleError } from "../master-password-rules";
import { useAsyncAction } from "../use-async-action";
import { ArgusMark } from "../ArgusMark";
import { basename, formatRelativeTime } from "../format";
import { EyeIcon, EyeOffIcon } from "../icons";
import { NewKeyFileChoice, newVaultKeyFile, NO_NEW_KEY_FILE } from "../new-key-file-choice";
import { KeyFileField } from "./KeyFileField";
import { NewKeyFileOption } from "./NewKeyFileOption";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

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
  const { busy, error, run, fail, clearError } = useAsyncAction();
  const [openPassword, setOpenPassword] = useState("");
  const [openKeyFilePath, setOpenKeyFilePath] = useState<string | undefined>(undefined);
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createConfirmPassword, setCreateConfirmPassword] = useState("");
  const [createKeyFile, setCreateKeyFile] = useState<NewKeyFileChoice>(NO_NEW_KEY_FILE);
  const [createPasswordRevealed, setCreatePasswordRevealed] = useState(false);
  const [createConfirmRevealed, setCreateConfirmRevealed] = useState(false);

  function resetToIdle() {
    setMode("idle");
    clearError();
    setOpenPassword("");
    setOpenKeyFilePath(undefined);
    setCreateName("");
    setCreatePassword("");
    setCreateConfirmPassword("");
    setCreateKeyFile(NO_NEW_KEY_FILE);
    setCreatePasswordRevealed(false);
    setCreateConfirmRevealed(false);
  }

  async function handleOpenSubmit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      // Undefined means the user cancelled the file dialog — nothing opened,
      // nothing to report.
      const opened = await vaultAccessService.openExistingVault(openPassword, openKeyFilePath);
      if (opened) {
        onOpened(opened);
      }
    }, "Failed to open vault.");
  }

  async function handleCreateSubmit(event: FormEvent) {
    event.preventDefault();
    if (createName.trim().length === 0) {
      fail("Vault name is required.");
      return;
    }
    if (createPassword.length === 0) {
      fail("Master password is required.");
      return;
    }
    const ruleError = masterPasswordRuleError("Master password", createPassword);
    if (ruleError) {
      fail(ruleError);
      return;
    }
    if (createPassword !== createConfirmPassword) {
      fail("Passwords do not match.");
      return;
    }
    const keyFile = newVaultKeyFile(createKeyFile);
    if (keyFile === "incomplete") {
      fail(
        createKeyFile.kind === "generate"
          ? "Choose where to save the key file."
          : "Choose the file to use as a key file.",
      );
      return;
    }

    await run(async () => {
      const opened = await vaultAccessService.createNewVault(createName, createPassword, keyFile);
      if (opened) {
        onOpened(opened);
      }
    }, "Failed to create vault.");
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
          <KeyFileField
            keyFilePath={openKeyFilePath}
            onPick={() => vaultAccessService.pickKeyFile()}
            onChange={setOpenKeyFilePath}
            disabled={busy}
          />
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
            <div className="field-input-with-action">
              <input
                id="create-password"
                type={createPasswordRevealed ? "text" : "password"}
                className="field-input"
                value={createPassword}
                onChange={(event) => {
                  setCreatePassword(event.target.value);
                  clearError();
                }}
                placeholder="Master password"
                aria-describedby="create-password-hint"
              />
              <button
                type="button"
                className="field-reveal-button"
                aria-label={createPasswordRevealed ? "Hide password" : "Show password"}
                title={createPasswordRevealed ? "Hide password" : "Show password"}
                onClick={() => setCreatePasswordRevealed((value) => !value)}
              >
                {createPasswordRevealed ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            <div id="create-password-hint" className="field-hint">
              {MASTER_PASSWORD_HINT}
            </div>
            <PasswordStrengthMeter password={createPassword} />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="create-confirm-password">
              Confirm password
            </label>
            <div className="field-input-with-action">
              <input
                id="create-confirm-password"
                type={createConfirmRevealed ? "text" : "password"}
                className="field-input"
                value={createConfirmPassword}
                onChange={(event) => {
                  setCreateConfirmPassword(event.target.value);
                  clearError();
                }}
                placeholder="Confirm password"
              />
              <button
                type="button"
                className="field-reveal-button"
                aria-label={
                  createConfirmRevealed ? "Hide confirm password" : "Show confirm password"
                }
                title={createConfirmRevealed ? "Hide password" : "Show password"}
                onClick={() => setCreateConfirmRevealed((value) => !value)}
              >
                {createConfirmRevealed ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </div>
          <NewKeyFileOption
            choice={createKeyFile}
            onChange={setCreateKeyFile}
            onPickSaveLocation={() => vaultAccessService.pickPathForNewKeyFile(createName)}
            onPickExisting={() => vaultAccessService.pickKeyFile()}
            disabled={busy}
          />
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
