import { SettingChangeHandler } from "../../setting-change";

interface WindowSectionProps {
  closeToTray: boolean;
  onSettingChange: SettingChangeHandler;
}

export function WindowSection({ closeToTray, onSettingChange }: WindowSectionProps) {
  return (
    <section className="detail-section">
      <div className="detail-section-label">Window</div>
      <div className="detail-card">
        <label className="detail-field-row" htmlFor="settings-close-to-tray">
          <span className="detail-field-row-label">
            Minimize to the system tray when the window is closed
          </span>
          <input
            id="settings-close-to-tray"
            type="checkbox"
            checked={closeToTray}
            onChange={(event) => onSettingChange("closeToTray", event.target.checked)}
          />
        </label>
      </div>
    </section>
  );
}
