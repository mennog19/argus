import { describe, expect, it, vi } from "vitest";
import { AutoTypeService } from "./auto-type-service";
import { AutoTyper, ForegroundWindow } from "./auto-type";
import { CustomField, CustomFields, Entry, Password } from "../domain";

const WINDOW: ForegroundWindow = {
  title: "Sign in to GitHub — Mozilla Firefox",
  processName: "firefox.exe",
};

function fakeAutoTyper(overrides: Partial<AutoTyper> = {}): AutoTyper {
  return {
    captureTarget: vi.fn().mockResolvedValue(WINDOW),
    typeIntoTarget: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function githubEntry(customFields?: CustomFields): Entry {
  return Entry.create({
    title: "GitHub",
    username: "menno",
    password: new Password("hunter2"),
    url: "https://github.com",
    customFields,
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
  it("types the resolved sequence into the captured window", async () => {
    const autoTyper = fakeAutoTyper();
    const service = new AutoTypeService(autoTyper);

    await service.perform(githubEntry(), "{USERNAME}{TAB}{PASSWORD}{ENTER}");

    expect(autoTyper.typeIntoTarget).toHaveBeenCalledWith([
      { kind: "text", text: "menno" },
      { kind: "key", key: "tab" },
      { kind: "text", text: "hunter2" },
      { kind: "key", key: "enter" },
    ]);
  });

  it("fills {TOTP} from the entry's authenticator field", async () => {
    const autoTyper = fakeAutoTyper();
    const service = new AutoTypeService(autoTyper);
    const entry = githubEntry(
      new CustomFields([new CustomField("otp", "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP")]),
    );

    await service.perform(entry, "{TOTP}");

    const [steps] = vi.mocked(autoTyper.typeIntoTarget).mock.calls[0];
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: "text" });
    expect((steps[0] as { text: string }).text).toMatch(/^\d{6}$/);
  });

  it("types nothing for {TOTP} when the entry has no authenticator", async () => {
    const autoTyper = fakeAutoTyper();
    const service = new AutoTypeService(autoTyper);

    await service.perform(githubEntry(), "{TOTP}{ENTER}");

    expect(autoTyper.typeIntoTarget).toHaveBeenCalledWith([{ kind: "key", key: "enter" }]);
  });

  it("does not compute a TOTP code for a sequence that never types one", async () => {
    const autoTyper = fakeAutoTyper();
    const service = new AutoTypeService(autoTyper);
    const entry = githubEntry(
      new CustomFields([new CustomField("otp", "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP")]),
    );
    const subtle = vi.spyOn(crypto.subtle, "importKey");

    await service.perform(entry, "{PASSWORD}");

    expect(subtle).not.toHaveBeenCalled();
    subtle.mockRestore();
  });

  it("propagates a typing failure so the caller can surface it", async () => {
    const service = new AutoTypeService(
      fakeAutoTyper({ typeIntoTarget: vi.fn().mockRejectedValue(new Error("input blocked")) }),
    );

    await expect(service.perform(githubEntry(), "{PASSWORD}")).rejects.toThrow("input blocked");
  });
});
