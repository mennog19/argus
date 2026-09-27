import { AppSettings, ConfigurableSetting } from "../application/settings";

export type SettingChangeHandler = <K extends ConfigurableSetting>(
  key: K,
  value: AppSettings[K],
) => void;
