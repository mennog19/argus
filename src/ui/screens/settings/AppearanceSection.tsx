import { CSSProperties } from "react";
import { AccentColor, Theme } from "../../../application/settings";
import { ACCENT_COLOR_PRESETS, accentColorHue } from "../../accent-color";
import { SettingChangeHandler } from "../../setting-change";

interface AppearanceSectionProps {
  theme: Theme;
  accentColor: AccentColor;
  onSettingChange: SettingChangeHandler;
}

export function AppearanceSection({ theme, accentColor, onSettingChange }: AppearanceSectionProps) {
  return (
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
              onClick={() => onSettingChange("theme", "dark")}
            >
              Dark
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={theme === "light"}
              className={`btn-secondary${theme === "light" ? " active" : ""}`}
              onClick={() => onSettingChange("theme", "light")}
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
                onClick={() => onSettingChange("accentColor", { kind: "preset", id: preset.id })}
              />
            ))}
            <button
              type="button"
              role="radio"
              className="accent-color-swatch accent-color-swatch-custom"
              aria-label="Custom"
              aria-checked={accentColor.kind === "custom"}
              onClick={() =>
                onSettingChange("accentColor", { kind: "custom", hue: accentColorHue(accentColor) })
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
                onSettingChange("accentColor", { kind: "custom", hue: Number(event.target.value) })
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
