import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  normalizeAccelerator,
  resolveShortcuts,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  shortcutConflicts,
  shortcutOverrides,
} from "../../src/application/shortcuts";

describe("DEFAULT_SHORTCUTS", () => {
  it("gives every action a label and a combination of its own", () => {
    expect(Object.keys(DEFAULT_SHORTCUTS)).toEqual([...SHORTCUT_ACTIONS]);
    expect(Object.keys(SHORTCUT_LABELS)).toEqual([...SHORTCUT_ACTIONS]);
    expect(shortcutConflicts(DEFAULT_SHORTCUTS).size).toBe(0);
  });

  it("is written the way shortcuts are compared", () => {
    for (const action of SHORTCUT_ACTIONS) {
      expect(normalizeAccelerator(DEFAULT_SHORTCUTS[action])).toBe(DEFAULT_SHORTCUTS[action]);
    }
  });

  it("leaves Ctrl+C to copying text", () => {
    expect(Object.values(DEFAULT_SHORTCUTS)).not.toContain("Control+C");
  });
});

describe("normalizeAccelerator", () => {
  it("keeps an accelerator that is already in order", () => {
    expect(normalizeAccelerator("Control+Shift+C")).toBe("Control+Shift+C");
  });

  it("puts modifiers in a fixed order, whatever order they were written in", () => {
    expect(normalizeAccelerator("Super+Shift+Alt+Control+K")).toBe("Control+Alt+Shift+Super+K");
  });

  it("accepts the spellings people type by hand", () => {
    expect(normalizeAccelerator("ctrl + shift + c")).toBe("Control+Shift+C");
    expect(normalizeAccelerator("CommandOrControl+Option+Win+F5")).toBe("Control+Alt+Super+F5");
  });

  it("counts a modifier written twice once", () => {
    expect(normalizeAccelerator("Ctrl+Control+L")).toBe("Control+L");
  });

  it("accepts a key on its own", () => {
    expect(normalizeAccelerator("Delete")).toBe("Delete");
    expect(normalizeAccelerator("7")).toBe("7");
  });

  it.each(["", "Control", "Control+", "Control+Nope", "Hyper+L", "Control+KeyL", "delete"])(
    "rejects %j",
    (value) => {
      expect(normalizeAccelerator(value)).toBeUndefined();
    },
  );
});

describe("resolveShortcuts", () => {
  it("is the defaults when nothing was rebound", () => {
    expect(resolveShortcuts(undefined)).toEqual(DEFAULT_SHORTCUTS);
  });

  it("lays the rebound actions over the defaults", () => {
    expect(resolveShortcuts({ lock: "Alt+L" })).toEqual({ ...DEFAULT_SHORTCUTS, lock: "Alt+L" });
  });
});

describe("shortcutOverrides", () => {
  it("is undefined for the defaults, so nothing is stored", () => {
    expect(shortcutOverrides(DEFAULT_SHORTCUTS)).toBeUndefined();
  });

  it("keeps only the actions that differ from their default", () => {
    const bindings = { ...DEFAULT_SHORTCUTS, lock: "Alt+L", openSettings: "F2" };

    expect(shortcutOverrides(bindings)).toEqual({ lock: "Alt+L", openSettings: "F2" });
  });
});

describe("shortcutConflicts", () => {
  it("flags every action sharing a combination, naming the others", () => {
    const conflicts = shortcutConflicts({
      ...DEFAULT_SHORTCUTS,
      newEntry: "Control+L",
      editEntry: "Control+L",
    });

    expect([...conflicts.keys()]).toEqual(["lock", "newEntry", "editEntry"]);
    expect(conflicts.get("lock")).toBe('Same as "New entry" and "Edit the selected entry".');
    expect(conflicts.get("newEntry")).toBe(
      'Same as "Lock the vault" and "Edit the selected entry".',
    );
  });

  it("flags a combination every text box already uses", () => {
    const conflicts = shortcutConflicts({ ...DEFAULT_SHORTCUTS, copyPassword: "Control+C" });

    expect(conflicts.get("copyPassword")).toBe("Already used for copying text.");
    expect(conflicts.size).toBe(1);
  });

  it("flags the combination Argus keeps for search", () => {
    const conflicts = shortcutConflicts({ ...DEFAULT_SHORTCUTS, lock: "Control+F" });

    expect(conflicts.get("lock")).toBe("Already used for searching.");
  });

  it("flags the auto-type hotkey, however that one is spelled", () => {
    const bindings = { ...DEFAULT_SHORTCUTS, copyUsername: "Control+Shift+A" };

    expect(shortcutConflicts(bindings, "CommandOrControl+Shift+A").get("copyUsername")).toBe(
      "Same as the auto-type hotkey.",
    );
    expect(shortcutConflicts(bindings).size).toBe(0);
  });

  it("isn't thrown by an auto-type hotkey it can't read", () => {
    expect(shortcutConflicts(DEFAULT_SHORTCUTS, "not a hotkey").size).toBe(0);
  });
});
