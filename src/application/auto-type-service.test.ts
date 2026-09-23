import { describe, expect, it, vi } from "vitest";
import { AutoTypeService } from "./auto-type-service";
import { AutoTyper, ForegroundWindow } from "./auto-type";
import { Entry, FormLayout, Password } from "../domain";

const WINDOW: ForegroundWindow = {
  title: "Sign in to GitHub — Mozilla Firefox",
  processName: "firefox.exe",
};

function fakeAutoTyper(overrides: Partial<AutoTyper> = {}): AutoTyper {
  return {
    captureTarget: vi.fn().mockResolvedValue(WINDOW),
    inspectTarget: vi.fn().mockResolvedValue({ hasUsernameField: true, hasPasswordField: true }),
    typeIntoTarget: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function githubEntry(): Entry {
  return Entry.create({
    title: "GitHub",
    username: "menno",
    password: new Password("hunter2"),
    url: "https://github.com",
  });
}

describe("AutoTypeService.capture", () => {
  it("returns the captured window with the entries that match its title", async () => {
    const entry = githubEntry();
    const unrelated = Entry.create({ title: "Bank", url: "https://bank.example" });
    const service = new AutoTypeService(fakeAutoTyper());

    const request = await service.capture([unrelated, entry]);

    expect(request).toEqual({ window: WINDOW, matches: [{ entry, score: 2 }] });
  });

  it("returns a request with no matches rather than nothing, so the user still sees the target", async () => {
    const service = new AutoTypeService(fakeAutoTyper());

    const request = await service.capture([Entry.create({ title: "Bank" })]);

    expect(request).toEqual({ window: WINDOW, matches: [] });
  });

  it("returns undefined when there is no window to type into", async () => {
    const service = new AutoTypeService(
      fakeAutoTyper({ captureTarget: vi.fn().mockResolvedValue(undefined) }),
    );

    expect(await service.capture([githubEntry()])).toBeUndefined();
  });
});

describe("AutoTypeService.perform", () => {
  const BOTH: FormLayout = { hasUsernameField: true, hasPasswordField: true };

  it("focuses each field the form has and types the entry's credentials into it", async () => {
    const autoTyper = fakeAutoTyper({ inspectTarget: vi.fn().mockResolvedValue(BOTH) });

    await new AutoTypeService(autoTyper).perform(githubEntry());

    expect(autoTyper.typeIntoTarget).toHaveBeenCalledWith([
      { kind: "focus", field: "username" },
      { kind: "text", text: "menno" },
      { kind: "focus", field: "password" },
      { kind: "text", text: "hunter2" },
      { kind: "submit" },
    ]);
  });

  it("fills only the password on a password-only page", async () => {
    const autoTyper = fakeAutoTyper({
      inspectTarget: vi.fn().mockResolvedValue({ hasUsernameField: false, hasPasswordField: true }),
    });

    await new AutoTypeService(autoTyper).perform(githubEntry());

    expect(autoTyper.typeIntoTarget).toHaveBeenCalledWith([
      { kind: "focus", field: "password" },
      { kind: "text", text: "hunter2" },
      { kind: "submit" },
    ]);
  });

  it("types nothing when the window has no login field", async () => {
    const autoTyper = fakeAutoTyper({
      inspectTarget: vi
        .fn()
        .mockResolvedValue({ hasUsernameField: false, hasPasswordField: false }),
    });

    await expect(new AutoTypeService(autoTyper).perform(githubEntry())).rejects.toThrow(
      "Couldn't find a username or password field in that window.",
    );
    expect(autoTyper.typeIntoTarget).not.toHaveBeenCalled();
  });

  it("types nothing when the window can't be inspected", async () => {
    const autoTyper = fakeAutoTyper({
      inspectTarget: vi.fn().mockRejectedValue(new Error("UI Automation unavailable")),
    });

    await expect(new AutoTypeService(autoTyper).perform(githubEntry())).rejects.toThrow(
      "UI Automation unavailable",
    );
    expect(autoTyper.typeIntoTarget).not.toHaveBeenCalled();
  });

  it("propagates a typing failure so the caller can surface it", async () => {
    const service = new AutoTypeService(
      fakeAutoTyper({
        inspectTarget: vi.fn().mockResolvedValue(BOTH),
        typeIntoTarget: vi.fn().mockRejectedValue(new Error("input blocked")),
      }),
    );

    await expect(service.perform(githubEntry())).rejects.toThrow("input blocked");
  });
});
