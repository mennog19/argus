import { describe, expect, it } from "vitest";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  recordVaultOpened,
  withClipboardClearSeconds,
  withGeneratorPolicy,
} from "./settings";

describe("recordVaultOpened", () => {
  it("adds a path to an empty list", () => {
    const openedAt = new Date("2026-01-01T00:00:00.000Z");

    const result = recordVaultOpened(DEFAULT_SETTINGS, "C:/vaults/a.kdbx", openedAt);

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

    const result = recordVaultOpened(settings, "C:/vaults/b.kdbx", openedAt);

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
      "C:/vaults/c.kdbx",
      new Date("2026-01-04T00:00:00.000Z"),
      2,
    );

    expect(result.recentVaults.map((e) => e.path)).toEqual(["C:/vaults/c.kdbx", "C:/vaults/a.kdbx"]);
  });

  it("defaults openedAt to now and maxEntries to 5 when not provided", () => {
    const result = recordVaultOpened(DEFAULT_SETTINGS, "C:/vaults/a.kdbx");

    expect(result.recentVaults).toHaveLength(1);
    expect(new Date(result.recentVaults[0].lastOpenedAt).getTime()).not.toBeNaN();
  });
});

describe("withGeneratorPolicy", () => {
  it("records the generator policy without disturbing other settings", () => {
    const settings: AppSettings = {
      recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
    };

    const result = withGeneratorPolicy(settings, { length: 24, useSymbols: true });

    expect(result.generatorPolicy).toEqual({ length: 24, useSymbols: true });
    expect(result.recentVaults).toBe(settings.recentVaults);
  });

  it("overwrites a previously stored generator policy", () => {
    const settings: AppSettings = { recentVaults: [], generatorPolicy: { length: 8 } };

    const result = withGeneratorPolicy(settings, { mode: "passphrase", wordCount: 5 });

    expect(result.generatorPolicy).toEqual({ mode: "passphrase", wordCount: 5 });
  });
});

describe("withClipboardClearSeconds", () => {
  it("records the clipboard clear delay without disturbing other settings", () => {
    const settings: AppSettings = {
      recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
    };

    const result = withClipboardClearSeconds(settings, 30);

    expect(result.clipboardClearSeconds).toBe(30);
    expect(result.recentVaults).toBe(settings.recentVaults);
  });
});
