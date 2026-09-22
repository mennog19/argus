import { AutoLockSettings, GroupDeleteMode } from "../../application/settings";
import { VaultFileInfo } from "../../application/vault-access-service";
import { basename, formatFileSize, formatRelativeTime } from "../format";

interface SettingsScreenProps {
  filePath: string;
  fileInfo: VaultFileInfo | undefined;
  clipboardClearSeconds: number;
  autoLock: AutoLockSettings;
  groupDeleteMode: GroupDeleteMode;
  onClipboardClearSecondsChange: (seconds: number) => void;
  onAutoLockChange: (autoLock: AutoLockSettings) => void;
  onGroupDeleteModeChange: (mode: GroupDeleteMode) => void;
}

export function SettingsScreen({
  filePath,
  fileInfo,
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

        <div className="detail-cards">
          <section className="detail-section">
            <div className="detail-section-label">Vault</div>
            <div className="detail-card">
              <div className="detail-field-row">
                <span className="detail-field-row-label">File</span>
                <span className="detail-field-value">{basename(filePath)}</span>
              </div>
              <div className="detail-field-row">
                <span className="detail-field-row-label">Size</span>
                <span className="detail-field-value">
                  {fileInfo ? formatFileSize(fileInfo.sizeBytes) : "—"}
                </span>
              </div>
              <div className="detail-field-row">
                <span className="detail-field-row-label">Last saved</span>
                <span className="detail-field-value" style={{ textTransform: "capitalize" }}>
                  {fileInfo
                    ? formatRelativeTime(new Date(fileInfo.lastModifiedMs).toISOString())
                    : "—"}
                </span>
              </div>
            </div>
          </section>

          <section className="detail-section">
            <div className="detail-section-label">Security</div>
            <div className="detail-card">
              <div className="detail-field-row">
                <label className="detail-field-row-label" htmlFor="settings-idle-timeout">
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
              <div className="detail-field-row">
                <label
                  className="detail-field-row-label"
                  htmlFor="settings-clipboard-clear-seconds"
                >
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
              <label className="detail-field-row" htmlFor="settings-lock-minimize">
                <span className="detail-field-row-label">Lock when the window is minimized</span>
                <input
                  id="settings-lock-minimize"
                  type="checkbox"
                  checked={autoLock.lockOnMinimize}
                  onChange={(event) => updateAutoLock({ lockOnMinimize: event.target.checked })}
                />
              </label>
              <label className="detail-field-row" htmlFor="settings-lock-sleep">
                <span className="detail-field-row-label">Lock when the system sleeps</span>
                <input
                  id="settings-lock-sleep"
                  type="checkbox"
                  checked={autoLock.lockOnSleep}
                  onChange={(event) => updateAutoLock({ lockOnSleep: event.target.checked })}
                />
              </label>
            </div>
          </section>

          <section className="detail-section">
            <div className="detail-section-label">Groups</div>
            <div className="detail-card padded">
              <div
                className="field-group"
                role="radiogroup"
                aria-labelledby="settings-group-delete"
              >
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
          </section>
        </div>
      </div>
    </div>
  );
}
