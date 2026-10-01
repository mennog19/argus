import { FormEvent, useState } from "react";
import { MasterPasswordChangeResult } from "../../application/vault-access-service";
import { MASTER_PASSWORD_HINT, masterPasswordRuleError } from "../master-password-rules";
import { useAsyncAction } from "../use-async-action";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { RekeyedBackupsNotes } from "./RekeyedBackupsNotes";

interface ChangeMasterPasswordCardProps {
  onChangeMasterPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<MasterPasswordChangeResult>;
}

export function ChangeMasterPasswordCard({
  onChangeMasterPassword,
}: ChangeMasterPasswordCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { busy, error, run, fail, clearError } = useAsyncAction();
  const [success, setSuccess] = useState<MasterPasswordChangeResult | undefined>(undefined);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccess(undefined);

    if (currentPassword.length === 0) {
      fail("Current password is required.");
      return;
    }
    if (newPassword.length === 0) {
      fail("New password is required.");
      return;
    }
    const ruleError = masterPasswordRuleError("New password", newPassword);
    if (ruleError) {
      fail(ruleError);
      return;
    }
    if (newPassword !== confirmPassword) {
      fail("New passwords do not match.");
      return;
    }

    // Only on a confirmed success: the vault file is re-encrypted by this, so
    // claiming it changed when it didn't leaves the user with a password that
    // doesn't open their vault.
    let result: MasterPasswordChangeResult | undefined;
    const changed = await run(async () => {
      result = await onChangeMasterPassword(currentPassword, newPassword);
    }, "Failed to change master password.");
    if (changed) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(result);
    }
  }

  const heading = (
    <div className="danger-zone-row-text">
      <span className="danger-zone-row-title">Master password</span>
      <span className="danger-zone-row-hint">
        Re-encrypts the whole vault. Lose the new password and there is no way back in.
      </span>
    </div>
  );

  if (!revealed) {
    return (
      <div className="danger-zone-row">
        {heading}
        <button type="button" className="btn-danger-outline" onClick={() => setRevealed(true)}>
          Change master password
        </button>
      </div>
    );
  }

  return (
    <div className="danger-zone-row expanded">
      {heading}
      <form className="danger-zone-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="field-group">
          <label className="field-label" htmlFor="change-password-current">
            Current password
          </label>
          <input
            id="change-password-current"
            type="password"
            className="field-input"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Current password"
          />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="change-password-new">
            New password
          </label>
          <input
            id="change-password-new"
            type="password"
            className="field-input"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              clearError();
            }}
            placeholder={MASTER_PASSWORD_HINT}
          />
          <PasswordStrengthMeter password={newPassword} />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="change-password-confirm">
            Confirm new password
          </label>
          <input
            id="change-password-confirm"
            type="password"
            className="field-input"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              clearError();
            }}
            placeholder="Confirm new password"
          />
        </div>
        {error && <div className="field-error">{error}</div>}
        {success && (
          <>
            <div className="field-success">Master password changed.</div>
            <RekeyedBackupsNotes
              result={success}
              nowOpen="with the new password"
              stillOpen="with the old password"
            />
          </>
        )}
        <button type="submit" className="btn-danger" disabled={busy}>
          {busy ? "Re-encrypting…" : "Change master password"}
        </button>
      </form>
    </div>
  );
}
