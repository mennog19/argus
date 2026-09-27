import { GroupDeleteMode } from "../../../application/settings";
import { SettingChangeHandler } from "../../setting-change";

interface GroupsSectionProps {
  groupDeleteMode: GroupDeleteMode;
  onSettingChange: SettingChangeHandler;
}

export function GroupsSection({ groupDeleteMode, onSettingChange }: GroupsSectionProps) {
  return (
    <section className="detail-section">
      <div className="detail-section-label">Groups</div>
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
              onChange={() => onSettingChange("groupDeleteMode", "deleteContents")}
            />
            Delete its entries and subgroups too
          </label>
          <label className="generator-checkbox">
            <input
              type="radio"
              name="settings-group-delete"
              checked={groupDeleteMode === "keepContents"}
              onChange={() => onSettingChange("groupDeleteMode", "keepContents")}
            />
            Keep its entries and subgroups (move them to the parent group)
          </label>
        </div>
      </div>
    </section>
  );
}
