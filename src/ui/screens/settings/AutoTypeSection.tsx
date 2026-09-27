import { AutoTypeSettings } from "../../../application/settings";
import { HotkeyField } from "../HotkeyField";
import { SettingChangeHandler } from "../../setting-change";

interface AutoTypeSectionProps {
  autoType: AutoTypeSettings;
  onSettingChange: SettingChangeHandler;
}

export function AutoTypeSection({ autoType, onSettingChange }: AutoTypeSectionProps) {
  function updateAutoType(patch: Partial<AutoTypeSettings>) {
    onSettingChange("autoType", { ...autoType, ...patch });
  }

  return (
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
          Press the hotkey while another window is focused and Argus offers the entries matching
          that window&rsquo;s title, then types the chosen one into it. Only works while the vault
          is unlocked.
        </p>
        <div className="detail-field-row">
          <label className="detail-field-row-label" htmlFor="settings-auto-type-hotkey">
            Hotkey
          </label>
          <HotkeyField
            id="settings-auto-type-hotkey"
            value={autoType.hotkey}
            onChange={(hotkey) => updateAutoType({ hotkey })}
          />
        </div>
        <p className="detail-card-hint">
          Argus finds the username and password fields on the page and types into them directly, so
          extra fields or icons between them don&rsquo;t matter. On the first page of a two-step
          login it fills the username; press the hotkey again on the next page for the password. It
          doesn&rsquo;t type into pages where it can&rsquo;t find a login field.
        </p>
      </div>
    </section>
  );
}
