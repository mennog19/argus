import { FormEvent, useState } from "react";
import { MASTER_PASSWORD_MIN_LENGTH } from "../../domain";
import { MasterPasswordChangeResult } from "../../application/vault-access-service";
import { useAsyncAction } from "../use-async-action";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

interface ChangeMasterPasswordCardProps {
  onChangeMasterPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<MasterPasswordChangeResult>;
}

function removedBackupsNote(paths: string[]): string {
  return paths.length === 1
    ? "1 backup couldn't be re-encrypted and was deleted."
    : `${paths.length} backups couldn't be re-encrypted and were deleted.`;
}

export function ChangeMasterPasswordCard({
  onChangeMasterPassword,
}: ChangeMasterPasswordCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { busy, error, run, fail } = useAsyncAction();
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
    if (newPassword.length < MASTER_PASSWORD_MIN_LENGTH) {
      fail(`New password must be at least ${MASTER_PASSWORD_MIN_LENGTH} characters.`);
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
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder={`At least ${MASTER_PASSWORD_MIN_LENGTH} characters`}
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
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
          />
        </div>
        {error && <div className="field-error">{error}</div>}
        {success && (
          <>
            <div className="field-success">Master password changed.</div>
            <div className="danger-zone-row-hint">
              The vault&apos;s .bak backups were re-encrypted with the new password too.
              {success.removedBackups.length > 0 &&
                ` ${removedBackupsNote(success.removedBackups)}`}
            </div>
            {success.unprotectedBackups.length > 0 && (
              <div className="field-error">
                These backups could not be re-encrypted or deleted and may still open with the old
                password. Delete them yourself: {success.unprotectedBackups.join(", ")}
              </div>
            )}
            <div className="danger-zone-row-hint">
              Copies made outside Argus, such as cloud sync version history or files you copied
              yourself, still open with the old password.
            </div>
          </>
        )}
        <button type="submit" className="btn-danger" disabled={busy}>
          {busy ? "Re-encrypting…" : "Change master password"}
        </button>
      </form>
    </div>
  );
}
