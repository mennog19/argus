import { EntryFieldVisibility } from "../../../application/settings";
import { SettingChangeHandler } from "../../setting-change";

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

interface EntryCreationSectionProps {
  entryFieldVisibility: EntryFieldVisibility;
  onSettingChange: SettingChangeHandler;
}

export function EntryCreationSection({
  entryFieldVisibility,
  onSettingChange,
}: EntryCreationSectionProps) {
  return (
    <section className="detail-section">
      <div className="detail-section-label">Entry creation</div>
      <div className="detail-card">
        {ENTRY_FIELD_TOGGLES.map(({ key, label }) => (
          <label key={key} className="detail-field-row" htmlFor={`settings-entry-field-${key}`}>
            <span className="detail-field-row-label">{label}</span>
            <input
              id={`settings-entry-field-${key}`}
              type="checkbox"
              checked={entryFieldVisibility[key]}
              onChange={(event) =>
                onSettingChange("entryFieldVisibility", {
                  ...entryFieldVisibility,
                  [key]: event.target.checked,
                })
              }
            />
          </label>
        ))}
      </div>
    </section>
  );
}
