import { describe, expect, it } from "vitest";
import { AppSettings, DEFAULT_SETTINGS } from "../../src/application/settings";
import {
  applyPortableSettings,
  parsePortableSettings,
  PORTABLE_SETTINGS_FORMAT,
  PORTABLE_SETTINGS_VERSION,
  PortableSettings,
  serializePortableSettings,
  SettingsImportError,
  toPortableSettings,
} from "../../src/application/settings-transfer";

const CUSTOMIZED: AppSettings = {
  recentVaults: [{ path: "C:/vaults/mine.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
  generatorPolicy: { length: 24 },
  theme: "light",
  accentColor: { kind: "custom", hue: 300 },
  clipboardClearSeconds: 45,
  autoLock: {
    idleTimeoutMinutes: 5,
    lockOnMinimize: true,
    lockOnSleep: false,
    lockOnSessionLock: false,
  },
  contentProtection: false,
  closeToTray: true,
  checkForUpdates: true,
  groupDeleteMode: "keepContents",
  expiredEntryAction: "recycle",
  entryFieldVisibility: {
    username: true,
    password: false,
    totp: true,
    url: false,
    notes: true,
    tags: false,
    group: true,
    expiry: false,
  },
};

function portableOf(settings: AppSettings = CUSTOMIZED): PortableSettings {
  return toPortableSettings(settings);
}

/** The exported file as a plain object, so tests can corrupt one field at a time. */
function rawOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...JSON.parse(JSON.stringify(portableOf())), ...overrides };
}

function importRaw(raw: Record<string, unknown>): PortableSettings {
  return parsePortableSettings(JSON.stringify(raw));
}

describe("toPortableSettings", () => {
  it("snapshots every shareable setting", () => {
    expect(portableOf()).toEqual({
      format: PORTABLE_SETTINGS_FORMAT,
      version: PORTABLE_SETTINGS_VERSION,
      appearance: { theme: "light", accentColor: { kind: "custom", hue: 300 } },
      security: {
        idleTimeoutMinutes: 5,
        lockOnMinimize: true,
        lockOnSleep: false,
        lockOnSessionLock: false,
        clipboardClearSeconds: 45,
        contentProtection: false,
      },
      window: { closeToTray: true },
      groups: { deleteMode: "keepContents" },
      entryCreation: { fieldVisibility: CUSTOMIZED.entryFieldVisibility },
      entries: { expiredAction: "recycle" },
    });
  });

  it("resolves unset settings to the defaults they behave as", () => {
    expect(portableOf(DEFAULT_SETTINGS)).toEqual({
      format: PORTABLE_SETTINGS_FORMAT,
      version: PORTABLE_SETTINGS_VERSION,
      appearance: { theme: "dark", accentColor: { kind: "preset", id: "blue" } },
      security: {
        idleTimeoutMinutes: undefined,
        lockOnMinimize: false,
        lockOnSleep: false,
        lockOnSessionLock: false,
        clipboardClearSeconds: 20,
        contentProtection: true,
      },
      window: { closeToTray: false },
      groups: { deleteMode: "deleteContents" },
      entryCreation: {
        fieldVisibility: {
          username: true,
          password: true,
          totp: true,
          url: true,
          notes: true,
          tags: true,
          group: true,
          expiry: true,
        },
      },
      entries: { expiredAction: "mark" },
    });
  });

  it("leaves the vault list out of the file", () => {
    expect(JSON.stringify(portableOf())).not.toContain("mine.kdbx");
  });

  it("leaves the update check out of the file", () => {
    expect(JSON.stringify(portableOf())).not.toMatch(/update/i);
  });
});

describe("serializePortableSettings", () => {
  it("writes indented JSON ending in a newline", () => {
    const text = serializePortableSettings(portableOf());

    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "appearance": {');
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(portableOf())));
  });
});

describe("applyPortableSettings", () => {
  it("overwrites every shareable setting", () => {
    const applied = applyPortableSettings(DEFAULT_SETTINGS, portableOf());

    expect(applied.theme).toBe("light");
    expect(applied.accentColor).toEqual({ kind: "custom", hue: 300 });
    expect(applied.clipboardClearSeconds).toBe(45);
    expect(applied.autoLock).toEqual({
      idleTimeoutMinutes: 5,
      lockOnMinimize: true,
      lockOnSleep: false,
      lockOnSessionLock: false,
    });
    expect(applied.contentProtection).toBe(false);
    expect(applied.closeToTray).toBe(true);
    expect(applied.groupDeleteMode).toBe("keepContents");
    expect(applied.entryFieldVisibility).toEqual(CUSTOMIZED.entryFieldVisibility);
    expect(applied.expiredEntryAction).toBe("recycle");
  });

  it("keeps the machine-local settings", () => {
    const applied = applyPortableSettings(CUSTOMIZED, portableOf(DEFAULT_SETTINGS));

    expect(applied.recentVaults).toEqual(CUSTOMIZED.recentVaults);
    expect(applied.generatorPolicy).toEqual({ length: 24 });
    expect(applied.checkForUpdates).toBe(true);
  });

  it("never turns the update check on", () => {
    const applied = applyPortableSettings(DEFAULT_SETTINGS, portableOf(CUSTOMIZED));

    expect(applied.checkForUpdates).toBeUndefined();
  });

  it("turns idle-timeout locking off when the file leaves it out", () => {
    const applied = applyPortableSettings(CUSTOMIZED, portableOf(DEFAULT_SETTINGS));

    expect(applied.autoLock?.idleTimeoutMinutes).toBeUndefined();
  });
});

describe("parsePortableSettings", () => {
  it("round-trips an exported file", () => {
    const parsed = parsePortableSettings(serializePortableSettings(portableOf()));

    expect(parsed).toEqual(portableOf());
  });

  it("round-trips a file exported with idle-timeout locking off", () => {
    const portable = portableOf(DEFAULT_SETTINGS);

    expect(parsePortableSettings(serializePortableSettings(portable))).toEqual(portable);
  });

  it("accepts an explicitly null idle timeout", () => {
    const raw = rawOf();
    (raw.security as Record<string, unknown>).idleTimeoutMinutes = null;

    expect(importRaw(raw).security.idleTimeoutMinutes).toBeUndefined();
  });

  it("rejects text that isn't JSON", () => {
    expect(() => parsePortableSettings("not json")).toThrow(SettingsImportError);
    expect(() => parsePortableSettings("not json")).toThrow(/not valid JSON/i);
  });

  it("rejects JSON that isn't an object", () => {
    expect(() => parsePortableSettings("[1, 2]")).toThrow(/not an Argus settings file/i);
    expect(() => parsePortableSettings("null")).toThrow(/not an Argus settings file/i);
  });

  it("rejects a JSON file that isn't an Argus settings file", () => {
    expect(() => importRaw(rawOf({ format: "something-else" }))).toThrow(
      /not an Argus settings file/i,
    );
  });

  it("rejects a file written by a different version", () => {
    expect(() => importRaw(rawOf({ version: 99 }))).toThrow(/different version/i);
  });

  it.each(["appearance", "security", "groups", "entryCreation"])(
    "rejects a file whose %s section is missing",
    (name) => {
      expect(() => importRaw(rawOf({ [name]: undefined }))).toThrow(
        new RegExp(`"${name}" section is missing`, "i"),
      );
    },
  );

  it("rejects a section that isn't an object", () => {
    expect(() => importRaw(rawOf({ groups: "keepContents" }))).toThrow(
      /"groups" section is missing/i,
    );
  });

  it("rejects an unknown theme", () => {
    const raw = rawOf();
    (raw.appearance as Record<string, unknown>).theme = "sepia";

    expect(() => importRaw(raw)).toThrow(/Theme must be one of: dark, light/i);
  });

  it("rejects a theme that isn't a string", () => {
    const raw = rawOf();
    (raw.appearance as Record<string, unknown>).theme = 1;

    expect(() => importRaw(raw)).toThrow(/Theme must be one of/i);
  });

  it("accepts a preset accent color", () => {
    const raw = rawOf();
    (raw.appearance as Record<string, unknown>).accentColor = { kind: "preset", id: "teal" };

    expect(importRaw(raw).appearance.accentColor).toEqual({ kind: "preset", id: "teal" });
  });

  it("rejects an unknown accent preset", () => {
    const raw = rawOf();
    (raw.appearance as Record<string, unknown>).accentColor = { kind: "preset", id: "chartreuse" };

    expect(() => importRaw(raw)).toThrow(/Accent color preset must be one of/i);
  });

  it.each([
    { kind: "custom", hue: 360 },
    { kind: "custom", hue: -1 },
    { kind: "custom", hue: 1.5 },
    {
      kind: "custom",
      hue: "200",
    },
  ])("rejects an out-of-range custom hue (%o)", (accentColor) => {
    const raw = rawOf();
    (raw.appearance as Record<string, unknown>).accentColor = accentColor;

    expect(() => importRaw(raw)).toThrow(/hue must be a whole number from 0-359/i);
  });

  it.each([{ kind: "gradient" }, "blue", null])(
    "rejects a malformed accent color (%o)",
    (accentColor) => {
      const raw = rawOf();
      (raw.appearance as Record<string, unknown>).accentColor = accentColor;

      expect(() => importRaw(raw)).toThrow(/Accent color is missing or malformed/i);
    },
  );

  it("imports a file from before lock-on-session-lock existed with it turned off", () => {
    const raw = rawOf();
    delete (raw.security as Record<string, unknown>).lockOnSessionLock;

    expect(importRaw(raw).security.lockOnSessionLock).toBe(false);
  });

  it("imports a file from before the window section existed with minimize-to-tray off", () => {
    const raw = rawOf();
    delete raw.window;

    expect(importRaw(raw).window.closeToTray).toBe(false);
  });

  it("rejects a non-boolean minimize-to-tray", () => {
    const raw = rawOf({ window: { closeToTray: "yes" } });

    expect(() => importRaw(raw)).toThrow(/must be true or false/i);
  });

  it("rejects a malformed window section", () => {
    expect(() => importRaw(rawOf({ window: "tray" }))).toThrow(/"window" section/i);
  });

  it.each(["lockOnMinimize", "lockOnSleep", "lockOnSessionLock", "contentProtection"])(
    "rejects a non-boolean %s",
    (field) => {
      const raw = rawOf();
      (raw.security as Record<string, unknown>)[field] = "yes";

      expect(() => importRaw(raw)).toThrow(/must be true or false/i);
    },
  );

  it("rejects a clipboard clear delay over 10 minutes, and says what the range is", () => {
    const raw = rawOf();
    (raw.security as Record<string, unknown>).clipboardClearSeconds = 601;

    expect(() => importRaw(raw)).toThrow(
      "Clipboard clear seconds must be a whole number from 1 to 600.",
    );
  });

  it("rejects an idle timeout over 24 hours, and says what the range is", () => {
    const raw = rawOf();
    (raw.security as Record<string, unknown>).idleTimeoutMinutes = 1441;

    expect(() => importRaw(raw)).toThrow(
      "Lock-after-inactivity minutes must be a whole number from 1 to 1440.",
    );
  });

  it("accepts the largest allowed clipboard delay and idle timeout", () => {
    const raw = rawOf();
    (raw.security as Record<string, unknown>).clipboardClearSeconds = 600;
    (raw.security as Record<string, unknown>).idleTimeoutMinutes = 1440;

    expect(importRaw(raw).security).toMatchObject({
      clipboardClearSeconds: 600,
      idleTimeoutMinutes: 1440,
    });
  });

  it.each([0, -1, 2.5, "30", null])("rejects a clipboard clear delay of %o", (seconds) => {
    const raw = rawOf();
    (raw.security as Record<string, unknown>).clipboardClearSeconds = seconds;

    expect(() => importRaw(raw)).toThrow(/Clipboard clear seconds must be a whole number/i);
  });

  it("rejects an idle timeout below a minute", () => {
    const raw = rawOf();
    (raw.security as Record<string, unknown>).idleTimeoutMinutes = 0;

    expect(() => importRaw(raw)).toThrow(/Lock-after-inactivity minutes must be a whole number/i);
  });

  it("imports a file from before the expired entry action existed as marking them", () => {
    expect(importRaw(rawOf({ entries: undefined })).entries.expiredAction).toBe("mark");
    expect(importRaw(rawOf({ entries: {} })).entries.expiredAction).toBe("mark");
  });

  it("rejects an entries section that isn't an object", () => {
    expect(() => importRaw(rawOf({ entries: "mark" }))).toThrow(/"entries" section is missing/i);
  });

  it("rejects an unknown expired entry action", () => {
    expect(() => importRaw(rawOf({ entries: { expiredAction: "archive" } }))).toThrow(
      /Expired entry action must be one of: mark, recycle, delete/i,
    );
  });

  it("rejects an unknown group delete mode", () => {
    const raw = rawOf();
    (raw.groups as Record<string, unknown>).deleteMode = "recycle";

    expect(() => importRaw(raw)).toThrow(/Group delete mode must be one of/i);
  });

  it("rejects field visibility that isn't an object", () => {
    const raw = rawOf();
    (raw.entryCreation as Record<string, unknown>).fieldVisibility = "all";

    expect(() => importRaw(raw)).toThrow(/field visibility is missing or malformed/i);
  });

  it("rejects field visibility missing a field", () => {
    const raw = rawOf();
    const visibility = (raw.entryCreation as Record<string, unknown>).fieldVisibility as Record<
      string,
      unknown
    >;
    delete visibility.totp;

    expect(() => importRaw(raw)).toThrow(/Entry field "totp" must be true or false/i);
  });

  it("imports field visibility from before the expiry field existed with it shown", () => {
    const raw = rawOf();
    const visibility = (raw.entryCreation as Record<string, unknown>).fieldVisibility as Record<
      string,
      unknown
    >;
    delete visibility.expiry;

    expect(importRaw(raw).entryCreation.fieldVisibility.expiry).toBe(true);
  });

  it("rejects a non-boolean expiry field visibility", () => {
    const raw = rawOf();
    const visibility = (raw.entryCreation as Record<string, unknown>).fieldVisibility as Record<
      string,
      unknown
    >;
    visibility.expiry = "yes";

    expect(() => importRaw(raw)).toThrow(/Entry field "expiry" must be true or false/i);
  });
});
