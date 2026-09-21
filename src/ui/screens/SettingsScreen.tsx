import { AutoLockSettings, GroupDeleteMode } from "../../application/settings";

interface SettingsScreenProps {
  clipboardClearSeconds: number;
  autoLock: AutoLockSettings;
  groupDeleteMode: GroupDeleteMode;
  onClipboardClearSecondsChange: (seconds: number) => void;
  onAutoLockChange: (autoLock: AutoLockSettings) => void;
  onGroupDeleteModeChange: (mode: GroupDeleteMode) => void;
}

export function SettingsScreen({
  clipboardClearSeconds,
  autoLock,
  groupDeleteMode,
  onClipboardClearSecondsChange,
  onAutoLockChange,
  onGroupDeleteModeChange,
}: SettingsScreenProps) {
  function updateAutoLock(patch: Partial<AutoLockSettings>) {
    onAutoLockChange({ ...autoLock, ...patch });
  }

  return (
    <div className="detail-pane">
      <div className="detail-content">
        <h1 className="detail-title">Settings</h1>

        <div className="detail-card padded">
          <div className="field-group">
            <label className="field-label" htmlFor="settings-clipboard-clear-seconds">
              Clear clipboard after (seconds)
            </label>
            <input
              id="settings-clipboard-clear-seconds"
              type="number"
              min={1}
              className="field-input"
              value={clipboardClearSeconds}
              onChange={(event) => {
                const seconds = Number(event.target.value);
                if (Number.isInteger(seconds) && seconds >= 1) {
                  onClipboardClearSecondsChange(seconds);
                }
              }}
            />
          </div>
        </div>

        <div className="detail-card padded">
          <div className="field-group">
            <label className="field-label" htmlFor="settings-idle-timeout">
              Lock after inactivity (minutes, blank = never)
            </label>
            <input
              id="settings-idle-timeout"
              type="number"
              min={1}
              className="field-input"
              value={autoLock.idleTimeoutMinutes ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  updateAutoLock({ idleTimeoutMinutes: undefined });
                  return;
                }
                const minutes = Number(raw);
                if (Number.isInteger(minutes) && minutes >= 1) {
                  updateAutoLock({ idleTimeoutMinutes: minutes });
                }
              }}
            />
          </div>

          <label className="generator-checkbox">
            <input
              type="checkbox"
              checked={autoLock.lockOnMinimize}
              onChange={(event) => updateAutoLock({ lockOnMinimize: event.target.checked })}
            />
            Lock when the window is minimized
          </label>
          <label className="generator-checkbox">
            <input
              type="checkbox"
              checked={autoLock.lockOnSleep}
              onChange={(event) => updateAutoLock({ lockOnSleep: event.target.checked })}
            />
            Lock when the system sleeps
          </label>
        </div>

        <div className="detail-card padded">
          <div className="field-group" role="radiogroup" aria-labelledby="settings-group-delete">
            <span className="field-label" id="settings-group-delete">
              When deleting a group
            </span>
            <label className="generator-checkbox">
              <input
                type="radio"
                name="settings-group-delete"
                checked={groupDeleteMode === "deleteContents"}
                onChange={() => onGroupDeleteModeChange("deleteContents")}
              />
              Delete its entries and subgroups too
            </label>
            <label className="generator-checkbox">
              <input
                type="radio"
                name="settings-group-delete"
                checked={groupDeleteMode === "keepContents"}
                onChange={() => onGroupDeleteModeChange("keepContents")}
              />
              Keep its entries and subgroups (move them to the parent group)
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
