import { describe, expect, it } from "vitest";
import {
  AppSettings,
  ConfigurableSetting,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_AUTO_LOCK,
  DEFAULT_AUTO_TYPE,
  DEFAULT_CLIPBOARD_CLEAR_SECONDS,
  DEFAULT_CONTENT_PROTECTION,
  DEFAULT_ENTRY_FIELD_VISIBILITY,
  DEFAULT_ENTRY_SORT,
  DEFAULT_GROUP_DELETE_MODE,
  DEFAULT_SETTINGS,
  DEFAULT_THEME,
  recordVaultOpened,
  resolveSettings,
  withSetting,
} from "../../src/application/settings";

describe("recordVaultOpened", () => {
  it("adds a path to an empty list", () => {
    const openedAt = new Date("2026-01-01T00:00:00.000Z");

    const result = recordVaultOpened(DEFAULT_SETTINGS, { path: "C:/vaults/a.kdbx" }, openedAt);

    expect(result.recentVaults).toEqual([
      { path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("moves an already-known path to the front instead of duplicating it", () => {
    const settings: AppSettings = {
      recentVaults: [
        { path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
        { path: "C:/vaults/b.kdbx", lastOpenedAt: "2025-12-31T00:00:00.000Z" },
      ],
    };
    const openedAt = new Date("2026-01-02T00:00:00.000Z");

    const result = recordVaultOpened(settings, { path: "C:/vaults/b.kdbx" }, openedAt);

    expect(result.recentVaults).toEqual([
      { path: "C:/vaults/b.kdbx", lastOpenedAt: "2026-01-02T00:00:00.000Z" },
      { path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("caps the list at maxEntries, dropping the oldest", () => {
    const settings: AppSettings = {
      recentVaults: [
        { path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-03T00:00:00.000Z" },
        { path: "C:/vaults/b.kdbx", lastOpenedAt: "2026-01-02T00:00:00.000Z" },
      ],
    };

    const result = recordVaultOpened(
      settings,
      { path: "C:/vaults/c.kdbx" },
      new Date("2026-01-04T00:00:00.000Z"),
      2,
    );

    expect(result.recentVaults.map((e) => e.path)).toEqual([
      "C:/vaults/c.kdbx",
      "C:/vaults/a.kdbx",
    ]);
  });

  it("remembers the key file a vault was unlocked with", () => {
    const openedAt = new Date("2026-01-01T00:00:00.000Z");

    const result = recordVaultOpened(
      DEFAULT_SETTINGS,
      { path: "C:/vaults/a.kdbx", keyFilePath: "C:/keys/a.keyx" },
      openedAt,
    );

    expect(result.recentVaults).toEqual([
      {
        path: "C:/vaults/a.kdbx",
        lastOpenedAt: "2026-01-01T00:00:00.000Z",
        keyFilePath: "C:/keys/a.keyx",
      },
    ]);
  });

  it("forgets a vault's key file once it's unlocked without one", () => {
    const settings: AppSettings = {
      recentVaults: [
        {
          path: "C:/vaults/a.kdbx",
          lastOpenedAt: "2026-01-01T00:00:00.000Z",
          keyFilePath: "C:/keys/a.keyx",
        },
      ],
    };

    const result = recordVaultOpened(settings, { path: "C:/vaults/a.kdbx" });

    expect(result.recentVaults[0]).not.toHaveProperty("keyFilePath");
  });

  it("defaults openedAt to now and maxEntries to 5 when not provided", () => {
    const result = recordVaultOpened(DEFAULT_SETTINGS, { path: "C:/vaults/a.kdbx" });

    expect(result.recentVaults).toHaveLength(1);
    expect(new Date(result.recentVaults[0].lastOpenedAt).getTime()).not.toBeNaN();
  });
});

describe("withSetting", () => {
  const settings: AppSettings = {
    recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
  };

  /** The key's type ties `value` to it, so a mismatched pair won't compile. */
  function expectRecorded<K extends ConfigurableSetting>(key: K, value: AppSettings[K]) {
    const result = withSetting(settings, key, value);
    expect(result[key]).toEqual(value);
    expect(result.recentVaults).toBe(settings.recentVaults);
  }

  it("records each setting without disturbing the others", () => {
    expectRecorded("generatorPolicy", { length: 24, useSymbols: true });
    expectRecorded("clipboardClearSeconds", 30);
    expectRecorded("autoLock", {
      idleTimeoutMinutes: 10,
      lockOnMinimize: true,
      lockOnSleep: false,
    });
    expectRecorded("autoType", { enabled: true, hotkey: "Alt+Space" });
    expectRecorded("groupDeleteMode", "keepContents");
    expectRecorded("accentColor", { kind: "preset", id: "teal" });
    expectRecorded("theme", "light");
    expectRecorded("contentProtection", false);
    expectRecorded("entryFieldVisibility", {
      ...DEFAULT_ENTRY_FIELD_VISIBILITY,
      password: false,
    });
    expectRecorded("entrySort", "title-asc");
  });

  it("overwrites a value that was already stored", () => {
    const stored: AppSettings = { recentVaults: [], generatorPolicy: { length: 8 } };

    const result = withSetting(stored, "generatorPolicy", { length: 30, useSymbols: true });

    expect(result.generatorPolicy).toEqual({ length: 30, useSymbols: true });
  });

  it("records a custom accent hue", () => {
    const result = withSetting(DEFAULT_SETTINGS, "accentColor", { kind: "custom", hue: 210 });

    expect(result.accentColor).toEqual({ kind: "custom", hue: 210 });
  });
});

describe("resolveSettings", () => {
  it("fills every value the user has never set with its default", () => {
    expect(resolveSettings(DEFAULT_SETTINGS)).toEqual({
      // `PasswordPolicy` supplies its own defaults from an empty object.
      generatorPolicy: {},
      clipboardClearSeconds: DEFAULT_CLIPBOARD_CLEAR_SECONDS,
      autoLock: DEFAULT_AUTO_LOCK,
      autoType: DEFAULT_AUTO_TYPE,
      groupDeleteMode: DEFAULT_GROUP_DELETE_MODE,
      accentColor: DEFAULT_ACCENT_COLOR,
      theme: DEFAULT_THEME,
      contentProtection: DEFAULT_CONTENT_PROTECTION,
      entryFieldVisibility: DEFAULT_ENTRY_FIELD_VISIBILITY,
      entrySort: DEFAULT_ENTRY_SORT,
    });
  });

  it("keeps every value the user has set", () => {
    const chosen = {
      generatorPolicy: { length: 24 },
      clipboardClearSeconds: 45,
      autoLock: { idleTimeoutMinutes: 5, lockOnMinimize: true, lockOnSleep: true },
      autoType: { enabled: true, hotkey: "Alt+Space" },
      groupDeleteMode: "keepContents",
      accentColor: { kind: "custom", hue: 120 },
      theme: "light",
      contentProtection: false,
      entryFieldVisibility: { ...DEFAULT_ENTRY_FIELD_VISIBILITY, notes: false },
      entrySort: "title-desc",
    } satisfies Omit<AppSettings, "recentVaults">;

    expect(resolveSettings({ recentVaults: [], ...chosen })).toEqual(chosen);
  });
});
