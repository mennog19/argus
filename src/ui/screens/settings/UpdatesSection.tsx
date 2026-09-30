import { SettingChangeHandler } from "../../setting-change";

interface UpdatesSectionProps {
  checkForUpdates: boolean;
  onSettingChange: SettingChangeHandler;
}

export function UpdatesSection({ checkForUpdates, onSettingChange }: UpdatesSectionProps) {
  return (
    <section className="detail-section">
      <div className="detail-section-label">Updates</div>
      <div className="detail-card">
        <label className="detail-field-row" htmlFor="settings-check-for-updates">
          <span className="detail-field-row-label">Check for updates when Argus starts</span>
          <input
            id="settings-check-for-updates"
            type="checkbox"
            checked={checkForUpdates}
            onChange={(event) => onSettingChange("checkForUpdates", event.target.checked)}
          />
        </label>
        <p className="detail-card-hint">
          Once per launch, Argus asks GitHub whether a newer release exists and offers to install
          it. Nothing about you or your vaults is sent. Updates are only installed when you say so,
          and only if they carry Argus&rsquo;s release signature. Changing this takes effect the
          next time Argus starts.
        </p>
      </div>
    </section>
  );
}
