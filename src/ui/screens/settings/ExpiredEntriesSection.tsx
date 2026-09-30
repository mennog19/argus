import { ExpiredEntryAction } from "../../../application/settings";
import { SettingChangeHandler } from "../../setting-change";

interface ExpiredEntriesSectionProps {
  expiredEntryAction: ExpiredEntryAction;
  onSettingChange: SettingChangeHandler;
}

const CHOICES: readonly { readonly action: ExpiredEntryAction; readonly label: string }[] = [
  { action: "mark", label: "Keep it and mark it as expired" },
  { action: "recycle", label: "Move it to the recycle bin" },
  { action: "delete", label: "Delete it permanently, without a trace" },
];

export function ExpiredEntriesSection({
  expiredEntryAction,
  onSettingChange,
}: ExpiredEntriesSectionProps) {
  return (
    <section className="detail-section">
      <div className="detail-section-label">Expired entries</div>
      <div className="detail-card padded">
        <div className="field-group" role="radiogroup" aria-labelledby="settings-expired-entries">
          <span className="field-label" id="settings-expired-entries">
            When an entry expires
          </span>
          {CHOICES.map(({ action, label }) => (
            <label className="generator-checkbox" key={action}>
              <input
                type="radio"
                name="settings-expired-entries"
                checked={expiredEntryAction === action}
                onChange={() => onSettingChange("expiredEntryAction", action)}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="expiry-settings-hint">
          {expiredEntryAction === "delete"
            ? "Expired entries and their history are removed from the vault the next time it is open. This can't be undone."
            : "Applies to every vault you open with Argus, as soon as an entry's expiry date passes."}
        </p>
      </div>
    </section>
  );
}
