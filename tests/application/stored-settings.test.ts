import { describe, expect, it } from "vitest";
import { AppSettings, DEFAULT_SETTINGS } from "../../src/application/settings";
import { parseStoredSettings } from "../../src/application/stored-settings";

const FULL_SETTINGS: AppSettings = {
  recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
  generatorPolicy: {
    mode: "passphrase",
    length: 24,
    useUppercase: true,
    useLowercase: true,
    useDigits: false,
    useSymbols: true,
    excludeAmbiguous: true,
    wordCount: 6,
    separator: ".",
  },
  clipboardClearSeconds: 45,
  autoLock: { idleTimeoutMinutes: 10, lockOnMinimize: true, lockOnSleep: false },
  autoType: { enabled: true, hotkey: "CommandOrControl+Alt+K" },
  groupDeleteMode: "keepContents",
  accentColor: { kind: "custom", hue: 200 },
  theme: "light",
  contentProtection: false,
  entryFieldVisibility: {
    username: true,
    password: true,
    totp: false,
    url: true,
    notes: false,
    tags: true,
    group: true,
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
      groupDeleteMode: "shred",
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

  describe("autoLock", () => {
    it("accepts a missing or null idle timeout as disabled", () => {
      expect(parse({ autoLock: { lockOnMinimize: false, lockOnSleep: true } }).autoLock).toEqual({
        lockOnMinimize: false,
        lockOnSleep: true,
      });
      expect(
        parse({ autoLock: { idleTimeoutMinutes: null, lockOnMinimize: false, lockOnSleep: true } })
          .autoLock,
      ).toEqual({ lockOnMinimize: false, lockOnSleep: true });
    });

    it.each([
      ["a non-object", true],
      ["a bad idle timeout", { idleTimeoutMinutes: 1.5, lockOnMinimize: true, lockOnSleep: true }],
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

    it.each([
      ["a non-object", "strong"],
      ["an unknown mode", { mode: "emoji" }],
      ["a bad length", { length: -1 }],
      ["a non-boolean character-set flag", { useDigits: "no" }],
      ["a bad word count", { mode: "passphrase", wordCount: 0 }],
      ["an unknown separator", { separator: "+" }],
      [
        "a policy with every character set off",
        { useUppercase: false, useLowercase: false, useDigits: false, useSymbols: false },
      ],
    ])("drops %s", (_label, generatorPolicy) => {
      expect(parse({ generatorPolicy }).generatorPolicy).toBeUndefined();
    });
  });
});
