import { CSSProperties } from "react";
import {
  AccentColor,
  AutoLockSettings,
  AutoTypeSettings,
  EntryFieldVisibility,
  GroupDeleteMode,
  Theme,
} from "../../application/settings";
import { autoTypeSequenceError, DEFAULT_AUTO_TYPE_SEQUENCE } from "../../domain";
import { VaultFileInfo } from "../../application/vault-access-service";
import { ACCENT_COLOR_PRESETS, accentColorHue } from "../accent-color";
import { basename, formatFileSize, formatRelativeTime } from "../format";
import { ChevronIcon } from "../icons";
import { ChangeMasterPasswordCard } from "./ChangeMasterPasswordCard";
import { SettingsTransferCard } from "./SettingsTransferCard";

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
  autoType: AutoTypeSettings;
  groupDeleteMode: GroupDeleteMode;
  accentColor: AccentColor;
  theme: Theme;
  contentProtection: boolean;
  entryFieldVisibility: EntryFieldVisibility;
  onChangeMasterPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Why the last merge attempt never got started, e.g. the picked file is this vault. */
  mergeError: string | undefined;
  onOpenMergeWizard: () => void;
  onClipboardClearSecondsChange: (seconds: number) => void;
  onAutoLockChange: (autoLock: AutoLockSettings) => void;
  onAutoTypeChange: (autoType: AutoTypeSettings) => void;
  onGroupDeleteModeChange: (mode: GroupDeleteMode) => void;
  onAccentColorChange: (accentColor: AccentColor) => void;
  onThemeChange: (theme: Theme) => void;
  onContentProtectionChange: (contentProtection: boolean) => void;
  onEntryFieldVisibilityChange: (visibility: EntryFieldVisibility) => void;
  onExportSettings: () => Promise<string | undefined>;
  onImportSettings: () => Promise<string | undefined>;
}

export function SettingsScreen({
  filePath,
  fileInfo,
  entryCount,
  clipboardClearSeconds,
  autoLock,
  autoType,
  groupDeleteMode,
  accentColor,
  theme,
  contentProtection,
  entryFieldVisibility,
  onChangeMasterPassword,
  mergeError,
  onOpenMergeWizard,
  onClipboardClearSecondsChange,
  onAutoLockChange,
  onAutoTypeChange,
  onGroupDeleteModeChange,
  onAccentColorChange,
  onThemeChange,
  onContentProtectionChange,
  onEntryFieldVisibilityChange,
  onExportSettings,
  onImportSettings,
}: SettingsScreenProps) {
  function updateAutoLock(patch: Partial<AutoLockSettings>) {
    onAutoLockChange({ ...autoLock, ...patch });
  }

  function updateAutoType(patch: Partial<AutoTypeSettings>) {
    onAutoTypeChange({ ...autoType, ...patch });
  }

  const sequenceError = autoTypeSequenceError(autoType.sequence);

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
            <div className="detail-section-label">Auto-type</div>
            <div className="detail-card">
              <label className="detail-field-row" htmlFor="settings-auto-type-enabled">
                <span className="detail-field-row-label">
                  Type credentials into other apps with a hotkey
                </span>
                <input
                  id="settings-auto-type-enabled"
                  type="checkbox"
                  checked={autoType.enabled}
                  onChange={(event) => updateAutoType({ enabled: event.target.checked })}
                />
              </label>
              <p className="detail-card-hint">
                Press the hotkey while another window is focused and Argus offers the entries
                matching that window&rsquo;s title, then types the chosen one into it. Only works
                while the vault is unlocked.
              </p>
              <div className="detail-field-row">
                <label className="detail-field-row-label" htmlFor="settings-auto-type-hotkey">
                  Hotkey
                </label>
                <input
                  id="settings-auto-type-hotkey"
                  type="text"
                  className="field-input"
                  value={autoType.hotkey}
                  spellCheck={false}
                  onChange={(event) => updateAutoType({ hotkey: event.target.value })}
                />
              </div>
              <div className="detail-field-row">
                <label className="detail-field-row-label" htmlFor="settings-auto-type-sequence">
                  What to type
                </label>
                <input
                  id="settings-auto-type-sequence"
                  type="text"
                  className="field-input"
                  value={autoType.sequence}
                  spellCheck={false}
                  aria-invalid={sequenceError !== undefined}
                  onChange={(event) => updateAutoType({ sequence: event.target.value })}
                />
              </div>
              {sequenceError ? (
                <p className="field-error">{sequenceError}</p>
              ) : (
                <p className="detail-card-hint">
                  Placeholders: <code>{"{USERNAME}"}</code> <code>{"{PASSWORD}"}</code>{" "}
                  <code>{"{TOTP}"}</code> <code>{"{URL}"}</code> <code>{"{TITLE}"}</code>{" "}
                  <code>{"{TAB}"}</code> <code>{"{ENTER}"}</code> <code>{"{DELAY 500}"}</code>.
                  Default is <code>{DEFAULT_AUTO_TYPE_SEQUENCE}</code>.
                </p>
              )}
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
            <div className="detail-section-label">Settings file</div>
            <SettingsTransferCard
              onExportSettings={onExportSettings}
              onImportSettings={onImportSettings}
            />
          </section>

          <section className="detail-section danger-zone">
            <div className="detail-section-label danger-zone-label">Danger zone</div>
            <p className="danger-zone-lead">
              These change the vault itself. Both are applied straight to the file on disk — make
              sure you have a backup first.
            </p>

            <div className="danger-zone-rows">
              <div className="danger-zone-row">
                <div className="danger-zone-row-text">
                  <span className="danger-zone-row-title">Merge another vault</span>
                  <span className="danger-zone-row-hint">
                    Compare a second .kdbx file against this one and choose what to bring over.
                  </span>
                  {mergeError && <span className="field-error">{mergeError}</span>}
                </div>
                <button type="button" className="btn-danger-outline" onClick={onOpenMergeWizard}>
                  Merge another vault in…
                </button>
              </div>

              <ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
