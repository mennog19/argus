import {
  ACCENT_COLOR_PRESET_IDS,
  AccentColor,
  ENTRY_FIELD_KEYS,
  EntryFieldVisibility,
} from "./settings";

/*
 * Field validators shared by the settings import (`parsePortableSettings`),
 * which shows their messages to the user, and the local settings file loader
 * (`parseStoredSettings`), which drops whatever they reject.
 */

/**
 * Thrown by the validators below when a value isn't usable. The message is
 * written for the user, since the settings import shows it as-is on the
 * settings screen.
 */
export class SettingsImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsImportError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new SettingsImportError(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new SettingsImportError(`${label} must be true or false.`);
  }
  return value;
}

export function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new SettingsImportError(`${label} must be a whole number of at least 1.`);
  }
  return value;
}

export function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return positiveInteger(value, label);
}

export function parseAccentColor(value: unknown): AccentColor {
  if (isRecord(value)) {
    if (value.kind === "preset") {
      return {
        kind: "preset",
        id: oneOf(value.id, ACCENT_COLOR_PRESET_IDS, "Accent color preset"),
      };
    }
    if (value.kind === "custom") {
      const hue = value.hue;
      if (typeof hue !== "number" || !Number.isInteger(hue) || hue < 0 || hue > 359) {
        throw new SettingsImportError("Custom accent color hue must be a whole number from 0-359.");
      }
      return { kind: "custom", hue };
    }
  }
  throw new SettingsImportError("Accent color is missing or malformed.");
}

export function parseFieldVisibility(value: unknown): EntryFieldVisibility {
  if (!isRecord(value)) {
    throw new SettingsImportError("Entry creation field visibility is missing or malformed.");
  }
  const visibility: Record<string, boolean> = {};
  for (const key of ENTRY_FIELD_KEYS) {
    visibility[key] = parseBoolean(value[key], `Entry field "${key}"`);
  }
  return visibility as EntryFieldVisibility;
}
