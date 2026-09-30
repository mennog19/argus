import { describe, expect, it } from "vitest";
import { describeChanges } from "../../../../src/ui/screens/vault-shell/history-summary";

describe("describeChanges", () => {
  it("says when nothing Argus shows changed", () => {
    expect(describeChanges([])).toBe("No visible changes");
  });

  it("names a single field", () => {
    expect(describeChanges(["password"])).toBe("Password changed");
    expect(describeChanges(["url"])).toBe("URL changed");
    expect(describeChanges(["expiry"])).toBe("Expiry date changed");
  });

  it("lists several fields, joining the last with 'and'", () => {
    expect(describeChanges(["password", "url"])).toBe("Password and URL changed");
    expect(describeChanges(["title", "customFields", "icon"])).toBe(
      "Title, custom fields and icon changed",
    );
    expect(describeChanges(["username", "notes", "tags"])).toBe("Username, notes and tags changed");
  });
});
