import {
  AutoLockSettings,
  MAX_CLIPBOARD_CLEAR_SECONDS,
  MAX_IDLE_TIMEOUT_MINUTES,
} from "../../../application/settings";
import { NumberStepperField } from "./NumberStepperField";
import { SettingChangeHandler } from "../../setting-change";

interface SecuritySectionProps {
  autoLock: AutoLockSettings;
  clipboardClearSeconds: number;
  contentProtection: boolean;
  onSettingChange: SettingChangeHandler;
}

/** A typed whole number of at least 1, capped at `max` rather than rejected above it. */
function parsePositiveInteger(raw: string, max: number): number | undefined {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, max) : undefined;
}

export function SecuritySection({
  autoLock,
  clipboardClearSeconds,
  contentProtection,
  onSettingChange,
}: SecuritySectionProps) {
  function updateAutoLock(patch: Partial<AutoLockSettings>) {
    onSettingChange("autoLock", { ...autoLock, ...patch });
  }

  function inputIdleTimeout(raw: string) {
    if (raw === "") {
      updateAutoLock({ idleTimeoutMinutes: undefined });
      return;
    }
    const minutes = parsePositiveInteger(raw, MAX_IDLE_TIMEOUT_MINUTES);
    if (minutes !== undefined) {
      updateAutoLock({ idleTimeoutMinutes: minutes });
    }
  }

  /** Stepping below one minute turns idle locking off rather than going to zero. */
  function stepIdleTimeout(direction: 1 | -1) {
    const current = autoLock.idleTimeoutMinutes;
    if (direction === 1) {
      updateAutoLock({
        idleTimeoutMinutes: Math.min((current ?? 0) + 1, MAX_IDLE_TIMEOUT_MINUTES),
      });
      return;
    }
    if (current === undefined) {
      return;
    }
    updateAutoLock({ idleTimeoutMinutes: current <= 1 ? undefined : current - 1 });
  }

  function inputClipboardClearSeconds(raw: string) {
    const seconds = parsePositiveInteger(raw, MAX_CLIPBOARD_CLEAR_SECONDS);
    if (seconds !== undefined) {
      onSettingChange("clipboardClearSeconds", seconds);
    }
  }

  return (
    <section className="detail-section">
      <div className="detail-section-label">Security</div>
      <div className="detail-card">
        <NumberStepperField
          id="settings-idle-timeout"
          label="Lock after inactivity (minutes, blank = never)"
          value={autoLock.idleTimeoutMinutes}
          max={MAX_IDLE_TIMEOUT_MINUTES}
          increaseLabel="Increase lock-after-inactivity minutes"
          decreaseLabel="Decrease lock-after-inactivity minutes"
          onInput={inputIdleTimeout}
          onStep={stepIdleTimeout}
        />
        <NumberStepperField
          id="settings-clipboard-clear-seconds"
          label="Clear clipboard after (seconds)"
          value={clipboardClearSeconds}
          max={MAX_CLIPBOARD_CLEAR_SECONDS}
          increaseLabel="Increase clipboard clear seconds"
          decreaseLabel="Decrease clipboard clear seconds"
          onInput={inputClipboardClearSeconds}
          onStep={(direction) =>
            onSettingChange(
              "clipboardClearSeconds",
              Math.min(MAX_CLIPBOARD_CLEAR_SECONDS, Math.max(1, clipboardClearSeconds + direction)),
            )
          }
        />
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
            onChange={(event) => onSettingChange("contentProtection", event.target.checked)}
          />
        </label>
      </div>
    </section>
  );
}
