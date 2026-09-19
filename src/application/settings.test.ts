import { describe, expect, it } from "vitest";
import { AppSettings, DEFAULT_SETTINGS, recordVaultOpened } from "./settings";

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
