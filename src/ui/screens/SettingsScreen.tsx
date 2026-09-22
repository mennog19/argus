import { CSSProperties } from "react";
import {
  AccentColor,
  AutoLockSettings,
  EntryFieldVisibility,
  GroupDeleteMode,
  Theme,
} from "../../application/settings";
import { VaultFileInfo } from "../../application/vault-access-service";
import { ACCENT_COLOR_PRESETS, accentColorHue } from "../accent-color";
import { basename, formatFileSize, formatRelativeTime } from "../format";
import { ChevronIcon } from "../icons";
import { ChangeMasterPasswordCard } from "./ChangeMasterPasswordCard";

const ENTRY_FIELD_TOGGLES: ReadonlyArray<{
  key: keyof EntryFieldVisibility;
  label: string;
}> = [
  { key: "username", label: "Username" },
  { key: "password", label: "Password" },
  { key: "totp", label: "Authenticator (TOTP)" },
  { key: "url", label: "URL" },
  { key: "notes", label: "Notes" },
  { key: "group", label: "Group" },
  { key: "tags", label: "Tags" },
];

interface SettingsScreenProps {
  filePath: string;
  fileInfo: VaultFileInfo | undefined;
  entryCount: number;
  clipboardClearSeconds: number;
  autoLock: AutoLockSettings;
  groupDeleteMode: GroupDeleteMode;
  accentColor: AccentColor;
  theme: Theme;
  contentProtection: boolean;
  entryFieldVisibility: EntryFieldVisibility;
  onChangeMasterPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onClipboardClearSecondsChange: (seconds: number) => void;
  onAutoLockChange: (autoLock: AutoLockSettings) => void;
  onGroupDeleteModeChange: (mode: GroupDeleteMode) => void;
  onAccentColorChange: (accentColor: AccentColor) => void;
  onThemeChange: (theme: Theme) => void;
  onContentProtectionChange: (contentProtection: boolean) => void;
  onEntryFieldVisibilityChange: (visibility: EntryFieldVisibility) => void;
}

export function SettingsScreen({
  filePath,
  fileInfo,
  entryCount,
  clipboardClearSeconds,
  autoLock,
  groupDeleteMode,
  accentColor,
  theme,
  contentProtection,
  entryFieldVisibility,
  onChangeMasterPassword,
  onClipboardClearSecondsChange,
  onAutoLockChange,
  onGroupDeleteModeChange,
  onAccentColorChange,
  onThemeChange,
  onContentProtectionChange,
  onEntryFieldVisibilityChange,
}: SettingsScreenProps) {
  function updateAutoLock(patch: Partial<AutoLockSettings>) {
    onAutoLockChange({ ...autoLock, ...patch });
  }

  function stepIdleTimeout(direction: 1 | -1) {
    const current = autoLock.idleTimeoutMinutes;
    if (direction === 1) {
      updateAutoLock({ idleTimeoutMinutes: (current ?? 0) + 1 });
      return;
    }
    if (current === undefined) {
      return;
    }
    updateAutoLock({ idleTimeoutMinutes: current <= 1 ? undefined : current - 1 });
  }

  function stepClipboardClearSeconds(direction: 1 | -1) {
    const next = clipboardClearSeconds + direction;
    onClipboardClearSecondsChange(Math.max(1, next));
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
                <span className="detail-field-row-label">Passwords</span>
                <span className="detail-field-value">{entryCount}</span>
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
            <div className="detail-section-label">Appearance</div>
            <div className="detail-card padded">
              <div className="field-group">
                <span className="field-label">Theme</span>
                <div className="generator-mode-toggle" role="radiogroup" aria-label="Theme">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={theme === "dark"}
                    className={`btn-secondary${theme === "dark" ? " active" : ""}`}
                    onClick={() => onThemeChange("dark")}
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={theme === "light"}
                    className={`btn-secondary${theme === "light" ? " active" : ""}`}
                    onClick={() => onThemeChange("light")}
                  >
                    Light
                  </button>
                </div>
              </div>
              <div className="field-group">
                <span className="field-label">Accent color</span>
                <div className="accent-color-swatches" role="radiogroup" aria-label="Accent color">
                  {ACCENT_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      className="accent-color-swatch"
                      style={{ "--swatch-hue": preset.hue } as CSSProperties}
                      aria-label={preset.label}
                      aria-checked={accentColor.kind === "preset" && accentColor.id === preset.id}
                      onClick={() => onAccentColorChange({ kind: "preset", id: preset.id })}
                    />
                  ))}
                  <button
                    type="button"
                    role="radio"
                    className="accent-color-swatch accent-color-swatch-custom"
                    aria-label="Custom"
                    aria-checked={accentColor.kind === "custom"}
                    onClick={() =>
                      onAccentColorChange({ kind: "custom", hue: accentColorHue(accentColor) })
                    }
                  />
                </div>
              </div>
              {accentColor.kind === "custom" && (
                <div className="field-group accent-hue-slider-group">
                  <label className="field-label" htmlFor="settings-accent-hue">
                    Custom color
                  </label>
                  <input
                    id="settings-accent-hue"
                    type="range"
                    min={0}
                    max={359}
                    className="accent-hue-slider"
                    value={accentColor.hue}
                    onChange={(event) =>
                      onAccentColorChange({ kind: "custom", hue: Number(event.target.value) })
                    }
                  />
                </div>
              )}
            </div>
          </section>

          <section className="detail-section">
            <div className="detail-section-label">Security</div>
            <div className="detail-card">
              <div className="detail-field-row">
                <label className="detail-field-row-label" htmlFor="settings-idle-timeout">
                  Lock after inactivity (minutes, blank = never)
                </label>
                <div className="field-input-with-stepper">
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
                  <div className="field-stepper">
                    <button
                      type="button"
                      aria-label="Increase lock-after-inactivity minutes"
                      onClick={() => stepIdleTimeout(1)}
                    >
                      <ChevronIcon size={9} />
                    </button>
                    <button
                      type="button"
                      aria-label="Decrease lock-after-inactivity minutes"
                      onClick={() => stepIdleTimeout(-1)}
                    >
                      <ChevronIcon size={9} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="detail-field-row">
                <label
                  className="detail-field-row-label"
                  htmlFor="settings-clipboard-clear-seconds"
                >
                  Clear clipboard after (seconds)
                </label>
                <div className="field-input-with-stepper">
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
                  <div className="field-stepper">
                    <button
                      type="button"
                      aria-label="Increase clipboard clear seconds"
                      onClick={() => stepClipboardClearSeconds(1)}
                    >
                      <ChevronIcon size={9} />
                    </button>
                    <button
                      type="button"
                      aria-label="Decrease clipboard clear seconds"
                      onClick={() => stepClipboardClearSeconds(-1)}
                    >
                      <ChevronIcon size={9} />
                    </button>
                  </div>
                </div>
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
              <label className="detail-field-row" htmlFor="settings-content-protection">
                <span className="detail-field-row-label">
                  Hide window from screen sharing &amp; recording
                </span>
                <input
                  id="settings-content-protection"
                  type="checkbox"
                  checked={contentProtection}
                  onChange={(event) => onContentProtectionChange(event.target.checked)}
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

          <section className="detail-section">
            <div className="detail-section-label">Entry creation</div>
            <div className="detail-card">
              {ENTRY_FIELD_TOGGLES.map(({ key, label }) => (
                <label
                  key={key}
                  className="detail-field-row"
                  htmlFor={`settings-entry-field-${key}`}
                >
                  <span className="detail-field-row-label">{label}</span>
                  <input
                    id={`settings-entry-field-${key}`}
                    type="checkbox"
                    checked={entryFieldVisibility[key]}
                    onChange={(event) =>
                      onEntryFieldVisibilityChange({
                        ...entryFieldVisibility,
                        [key]: event.target.checked,
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="detail-section">
            <div className="detail-section-label">Master password</div>
            <ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />
          </section>
        </div>
      </div>
    </div>
  );
}
