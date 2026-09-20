interface SettingsScreenProps {
  clipboardClearSeconds: number;
  onClipboardClearSecondsChange: (seconds: number) => void;
}

export function SettingsScreen({
  clipboardClearSeconds,
  onClipboardClearSecondsChange,
}: SettingsScreenProps) {
  return (
    <div className="detail-pane">
      <div className="detail-content">
        <h1 className="detail-title">Settings</h1>

        <div className="detail-card padded">
          <div className="field-group">
            <label className="field-label" htmlFor="settings-clipboard-clear-seconds">
              Clear clipboard after (seconds)
            </label>
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
          </div>
        </div>
      </div>
    </div>
  );
}
