import {
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  ShortcutAction,
  ShortcutBindings,
  shortcutConflicts,
  shortcutOverrides,
} from "../../../application/shortcuts";
import { HotkeyField } from "../HotkeyField";
import { SettingChangeHandler } from "../../setting-change";

interface ShortcutsSectionProps {
  shortcuts: ShortcutBindings;
  /** The auto-type hotkey while auto-type is on, which no shortcut can share. */
  autoTypeHotkey: string | undefined;
  onSettingChange: SettingChangeHandler;
}

export function ShortcutsSection({
  shortcuts,
  autoTypeHotkey,
  onSettingChange,
}: ShortcutsSectionProps) {
  const conflicts = shortcutConflicts(shortcuts, autoTypeHotkey);
  const customized = shortcutOverrides(shortcuts) !== undefined;

  function rebind(action: ShortcutAction, accelerator: string) {
    onSettingChange("shortcuts", shortcutOverrides({ ...shortcuts, [action]: accelerator }));
  }

  return (
    <section className="detail-section">
      <div className="detail-section-label">Keyboard shortcuts</div>
      <div className="detail-card">
        <p className="detail-card-hint">
          Click a shortcut to change it. These work while the Argus window is focused and a vault is
          open. Ctrl+F always jumps to the search box.
        </p>
        {SHORTCUT_ACTIONS.map((action) => (
          <div className="detail-field-row" key={action}>
            <label className="detail-field-row-label" htmlFor={`settings-shortcut-${action}`}>
              {SHORTCUT_LABELS[action]}
            </label>
            <HotkeyField
              id={`settings-shortcut-${action}`}
              value={shortcuts[action]}
              onChange={(accelerator) => rebind(action, accelerator)}
              allowBareKeys
              conflict={conflicts.get(action)}
            />
          </div>
        ))}
        {conflicts.size > 0 && (
          <p className="field-error">
            The shortcuts in red clash with something else and may not do what they say. Give each
            its own combination.
          </p>
        )}
        {customized && (
          <div className="detail-field-row">
            <span className="detail-field-row-label">Put every shortcut back to its default</span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onSettingChange("shortcuts", undefined)}
            >
              Reset shortcuts
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
