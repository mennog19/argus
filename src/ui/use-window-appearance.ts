import { useEffect } from "react";
import { EffectiveSettings } from "../application/settings";
import { WindowProtection } from "../application/window-protection";
import { accentColorCssVars, accentColorHue } from "./accent-color";

/** Applies the theme, accent color and screen-capture protection settings to the window. */
export function useWindowAppearance(
  { theme, accentColor, contentProtection }: EffectiveSettings,
  windowProtection: WindowProtection,
): void {
  useEffect(() => {
    const { accent, accentHover } = accentColorCssVars(accentColorHue(accentColor));
    document.documentElement.style.setProperty("--color-accent", accent);
    document.documentElement.style.setProperty("--color-accent-hover", accentHover);
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void windowProtection.setContentProtected(contentProtection);
  }, [contentProtection, windowProtection]);
}
