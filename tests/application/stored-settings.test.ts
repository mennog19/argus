import { describe, expect, it } from "vitest";
import { AppSettings, DEFAULT_SETTINGS } from "../../src/application/settings";
import { parseStoredSettings } from "../../src/application/stored-settings";

const FULL_SETTINGS: AppSettings = {
  recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
  generatorPolicy: {
    length: 24,
    useUppercase: true,
    useLowercase: true,
    useDigits: false,
    useSymbols: true,
    excludeAmbiguous: true,
  },
  clipboardClearSeconds: 45,
  autoLock: {
    idleTimeoutMinutes: 10,
    lockOnMinimize: true,
    lockOnSleep: false,
    lockOnSessionLock: false,
  },
  autoType: { enabled: true, hotkey: "CommandOrControl+Alt+K" },
  groupDeleteMode: "keepContents",
  expiredEntryAction: "delete",
  accentColor: { kind: "custom", hue: 200 },
  theme: "light",
  contentProtection: false,
  closeToTray: true,
  entryFieldVisibility: {
    username: true,
    password: true,
    totp: false,
    url: true,
    notes: false,
    tags: true,
    group: true,
    expiry: false,
  },
  entrySort: "title-desc",
};

function parse(raw: unknown): AppSettings {
  return parseStoredSettings(JSON.stringify(raw));
}

describe("parseStoredSettings", () => {
  it("returns a well-formed settings file as-is", () => {
    expect(parse(FULL_SETTINGS)).toEqual(FULL_SETTINGS);
  });

  it("falls back to the defaults for text that isn't JSON", () => {
    expect(parseStoredSettings("{ not valid json")).toEqual(DEFAULT_SETTINGS);
  });

  it.each([null, [], "settings", 42])("falls back to the defaults for a non-object (%j)", (raw) => {
    expect(parse(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it("fills in an empty recent-vaults list for an empty object", () => {
    const result = parse({});

    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(result.recentVaults).toEqual([]);
  });

  it("replaces a non-array recent-vaults value with an empty list", () => {
    expect(parse({ recentVaults: "C:/vaults/a.kdbx" }).recentVaults).toEqual([]);
  });

  it("keeps the well-formed recent vaults and drops the rest", () => {
    const good = { path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" };

    const result = parse({
      recentVaults: [
        good,
        null,
        "C:/vaults/b.kdbx",
        { path: 7, lastOpenedAt: "2026-01-01T00:00:00.000Z" },
        { path: "C:/vaults/c.kdbx" },
        { ...good, extra: "ignored" },
      ],
    });

    expect(result.recentVaults).toEqual([good, good]);
  });

  it("keeps a recent vault's key file path, dropping one that isn't a string", () => {
    const good = { path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" };

    const result = parse({
      recentVaults: [
        { ...good, keyFilePath: "C:/keys/a.keyx" },
        { ...good, keyFilePath: 7 },
      ],
    });

    expect(result.recentVaults).toStrictEqual([{ ...good, keyFilePath: "C:/keys/a.keyx" }, good]);
  });

  it("drops malformed fields while keeping the valid ones", () => {
    const result = parse({
      ...FULL_SETTINGS,
      clipboardClearSeconds: 0,
      theme: "sepia",
      contentProtection: "yes",
      closeToTray: "yes",
      groupDeleteMode: "shred",
      expiredEntryAction: "archive",
      entrySort: "random",
      accentColor: { kind: "custom", hue: 400 },
      entryFieldVisibility: { username: true },
    });

    expect(result).toEqual({
      recentVaults: FULL_SETTINGS.recentVaults,
      generatorPolicy: FULL_SETTINGS.generatorPolicy,
      autoLock: FULL_SETTINGS.autoLock,
      autoType: FULL_SETTINGS.autoType,
    });
  });

  it("drops a clipboard clear delay over 10 minutes", () => {
    expect(parse({ clipboardClearSeconds: 601 }).clipboardClearSeconds).toBeUndefined();
    expect(parse({ clipboardClearSeconds: 600 }).clipboardClearSeconds).toBe(600);
  });

  it("keeps field visibility written before the expiry field existed, with it shown", () => {
    const withoutExpiry: Record<string, boolean> = { ...FULL_SETTINGS.entryFieldVisibility };
    delete withoutExpiry.expiry;

    expect(parse({ entryFieldVisibility: withoutExpiry }).entryFieldVisibility).toEqual({
      ...withoutExpiry,
      expiry: true,
    });
  });

  describe("autoLock", () => {
    it("keeps an autoLock written before lock-on-session-lock existed, with it turned off", () => {
      expect(parse({ autoLock: { lockOnMinimize: true, lockOnSleep: true } }).autoLock).toEqual({
        lockOnMinimize: true,
        lockOnSleep: true,
        lockOnSessionLock: false,
      });
    });

    it("drops an autoLock with a non-boolean lockOnSessionLock", () => {
      expect(
        parse({ autoLock: { lockOnMinimize: true, lockOnSleep: true, lockOnSessionLock: "yes" } })
          .autoLock,
      ).toBeUndefined();
    });

    it("accepts a missing or null idle timeout as disabled", () => {
      expect(
        parse({ autoLock: { lockOnMinimize: false, lockOnSleep: true, lockOnSessionLock: false } })
          .autoLock,
      ).toEqual({
        lockOnMinimize: false,
        lockOnSleep: true,
        lockOnSessionLock: false,
      });
      expect(
        parse({
          autoLock: {
            idleTimeoutMinutes: null,
            lockOnMinimize: false,
            lockOnSleep: true,
            lockOnSessionLock: false,
          },
        }).autoLock,
      ).toEqual({ lockOnMinimize: false, lockOnSleep: true, lockOnSessionLock: false });
    });

    it.each([
      ["a non-object", true],
      [
        "a bad idle timeout",
        {
          idleTimeoutMinutes: 1.5,
          lockOnMinimize: true,
          lockOnSleep: true,
          lockOnSessionLock: false,
        },
      ],
      [
        "an idle timeout over 24 hours",
        {
          idleTimeoutMinutes: 1441,
          lockOnMinimize: true,
          lockOnSleep: true,
          lockOnSessionLock: false,
        },
      ],
      ["a missing flag", { lockOnMinimize: true }],
    ])("drops %s", (_label, autoLock) => {
      expect(parse({ autoLock }).autoLock).toBeUndefined();
    });
  });

  describe("autoType", () => {
    it.each([
      ["a non-object", "on"],
      ["a missing hotkey", { enabled: true }],
      ["an empty hotkey", { enabled: true, hotkey: "" }],
      ["a non-boolean enabled flag", { enabled: 1, hotkey: "CommandOrControl+Shift+A" }],
    ])("drops %s", (_label, autoType) => {
      expect(parse({ autoType }).autoType).toBeUndefined();
    });
  });

  describe("generatorPolicy", () => {
    it("keeps a partial policy, leaving the rest to the generator's defaults", () => {
      expect(parse({ generatorPolicy: { length: 32 } }).generatorPolicy).toEqual({ length: 32 });
    });

    it("ignores the passphrase keys an older build saved, keeping the rest of the policy", () => {
      const generatorPolicy = { mode: "passphrase", wordCount: 6, separator: ".", length: 20 };

      expect(parse({ generatorPolicy }).generatorPolicy).toEqual({ length: 20 });
    });

    it.each([
      ["a non-object", "strong"],
      ["a bad length", { length: -1 }],
      ["a non-boolean character-set flag", { useDigits: "no" }],
      [
        "a policy with every character set off",
        { useUppercase: false, useLowercase: false, useDigits: false, useSymbols: false },
      ],
    ])("drops %s", (_label, generatorPolicy) => {
      expect(parse({ generatorPolicy }).generatorPolicy).toBeUndefined();
    });
  });
});
