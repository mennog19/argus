import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutoTyper, ForegroundWindow, GlobalHotkey } from "../../src/application/auto-type";
import { AutoTypeService } from "../../src/application/auto-type-service";
import { AutoTypeSettings } from "../../src/application/settings";
import { Entry, Password } from "../../src/domain";
import { useAutoType } from "../../src/ui/use-auto-type";

const SETTINGS: AutoTypeSettings = {
  enabled: true,
  hotkey: "CommandOrControl+Shift+A",
};

const WINDOW: ForegroundWindow = { title: "GitHub — Firefox", processName: "firefox.exe" };

const ENTRY = Entry.create({
  title: "GitHub",
  username: "menno",
  password: new Password("hunter2"),
  url: "https://github.com",
});

function fakeAutoTyper(overrides: Partial<AutoTyper> = {}): AutoTyper {
  return {
    captureTarget: vi.fn().mockResolvedValue(WINDOW),
    inspectTarget: vi.fn().mockResolvedValue({ hasUsernameField: true, hasPasswordField: true }),
    typeIntoTarget: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeHotkey(overrides: Partial<GlobalHotkey> = {}): GlobalHotkey {
  return {
    register: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Invokes the handler the hook gave the hotkey port, as a press would. */
async function press(hotkey: GlobalHotkey): Promise<void> {
  const handler = vi.mocked(hotkey.register).mock.calls[0][1];
  await act(async () => {
    handler();
    await Promise.resolve();
  });
}

function setup(
  options: {
    autoTyper?: AutoTyper;
    hotkey?: GlobalHotkey;
    settings?: AutoTypeSettings;
    entries?: readonly Entry[];
  } = {},
) {
  const autoTyper = options.autoTyper ?? fakeAutoTyper();
  const hotkey = options.hotkey ?? fakeHotkey();
  const service = new AutoTypeService(autoTyper);
  const rendered = renderHook(
    ({ settings, entries }: { settings: AutoTypeSettings; entries: readonly Entry[] }) =>
      useAutoType(service, hotkey, settings, entries),
    {
      initialProps: {
        settings: options.settings ?? SETTINGS,
        entries: options.entries ?? [ENTRY],
      },
    },
  );
  return { ...rendered, autoTyper, hotkey };
}

describe("useAutoType", () => {
  it("binds the configured hotkey when auto-type is enabled", async () => {
    const { hotkey } = setup();

    await waitFor(() =>
      expect(hotkey.register).toHaveBeenCalledWith(SETTINGS.hotkey, expect.any(Function)),
    );
  });

  it("binds nothing when auto-type is disabled", () => {
    const { hotkey } = setup({ settings: { ...SETTINGS, enabled: false } });

    expect(hotkey.register).not.toHaveBeenCalled();
  });

  it("releases the hotkey when it unmounts", async () => {
    const { hotkey, unmount } = setup();

    unmount();

    expect(hotkey.unregister).toHaveBeenCalled();
  });

  it("rebinds when the accelerator changes", async () => {
    const { hotkey, rerender } = setup();

    rerender({ settings: { ...SETTINGS, hotkey: "Alt+Space" }, entries: [ENTRY] });

    await waitFor(() =>
      expect(hotkey.register).toHaveBeenLastCalledWith("Alt+Space", expect.any(Function)),
    );
  });

  it("does not rebind just because the vault's entries changed", async () => {
    const { hotkey, rerender } = setup();
    await waitFor(() => expect(hotkey.register).toHaveBeenCalledTimes(1));

    rerender({ settings: SETTINGS, entries: [ENTRY, Entry.create({ title: "Bank" })] });

    expect(hotkey.register).toHaveBeenCalledTimes(1);
  });

  it("exposes the captured window and its matches after a press", async () => {
    const { result, hotkey } = setup();

    await press(hotkey);

    // Score 2: the window title carries the site name, not the full host.
    expect(result.current.request).toEqual({
      window: WINDOW,
      matches: [{ entry: ENTRY, score: 2 }],
    });
  });

  it("matches against the entries as they are at press time, not at bind time", async () => {
    const added = Entry.create({ title: "GitHub work", url: "https://github.com" });
    const { result, hotkey, rerender } = setup({ entries: [] });
    rerender({ settings: SETTINGS, entries: [added] });

    await press(hotkey);

    expect(result.current.request?.matches.map((match) => match.entry)).toEqual([added]);
  });

  it("stays quiet when Argus itself was in front", async () => {
    const hotkey = fakeHotkey();
    const { result } = setup({
      hotkey,
      autoTyper: fakeAutoTyper({ captureTarget: vi.fn().mockResolvedValue(undefined) }),
    });

    await press(hotkey);

    expect(result.current.request).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it("types the chosen entry and closes the picker", async () => {
    const autoTyper = fakeAutoTyper();
    const { result, hotkey } = setup({ autoTyper });
    await press(hotkey);

    await act(async () => {
      result.current.typeInto(ENTRY);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(autoTyper.typeIntoTarget).toHaveBeenCalledWith([
        { kind: "focus", field: "username" },
        { kind: "text", text: "menno" },
        { kind: "focus", field: "password" },
        { kind: "text", text: "hunter2" },
        { kind: "submit" },
      ]),
    );
    expect(result.current.request).toBeUndefined();
  });

  it("says so, and types nothing, when the window has no login field", async () => {
    const autoTyper = fakeAutoTyper({
      inspectTarget: vi
        .fn()
        .mockResolvedValue({ hasUsernameField: false, hasPasswordField: false }),
    });
    const { result, hotkey } = setup({ autoTyper });
    await press(hotkey);

    await act(async () => {
      result.current.typeInto(ENTRY);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current.error).toBe(
        "Couldn't find a username or password field in that window.",
      ),
    );
    expect(autoTyper.typeIntoTarget).not.toHaveBeenCalled();
  });

  it("closes the picker without typing when dismissed", async () => {
    const autoTyper = fakeAutoTyper();
    const { result, hotkey } = setup({ autoTyper });
    await press(hotkey);

    act(() => result.current.dismiss());

    expect(result.current.request).toBeUndefined();
    expect(autoTyper.typeIntoTarget).not.toHaveBeenCalled();
  });

  it("surfaces a hotkey the OS refused", async () => {
    const { result } = setup({
      hotkey: fakeHotkey({ register: vi.fn().mockRejectedValue(new Error("already in use")) }),
    });

    await waitFor(() => expect(result.current.error).toBe("already in use"));
  });

  it("falls back to a hotkey-specific message when the failure carries none", async () => {
    const { result } = setup({
      hotkey: fakeHotkey({ register: vi.fn().mockRejectedValue(undefined) }),
    });

    await waitFor(() =>
      expect(result.current.error).toBe(
        "Could not register CommandOrControl+Shift+A. Another app may hold it.",
      ),
    );
  });

  it("surfaces a failure to read the foreground window", async () => {
    const hotkey = fakeHotkey();
    const { result } = setup({
      hotkey,
      autoTyper: fakeAutoTyper({ captureTarget: vi.fn().mockRejectedValue("no window") }),
    });

    await press(hotkey);

    await waitFor(() => expect(result.current.error).toBe("no window"));
  });

  it("surfaces a failure to type", async () => {
    const hotkey = fakeHotkey();
    const { result } = setup({
      hotkey,
      autoTyper: fakeAutoTyper({
        typeIntoTarget: vi.fn().mockRejectedValue(new Error("input blocked")),
      }),
    });
    await press(hotkey);

    await act(async () => {
      result.current.typeInto(ENTRY);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.error).toBe("input blocked"));
  });

  it("clears a previous error once a press succeeds", async () => {
    const hotkey = fakeHotkey();
    const { result } = setup({
      hotkey,
      autoTyper: fakeAutoTyper({
        typeIntoTarget: vi.fn().mockRejectedValue(new Error("input blocked")),
      }),
    });
    await press(hotkey);
    await act(async () => {
      result.current.typeInto(ENTRY);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.error).toBe("input blocked"));

    await press(hotkey);

    expect(result.current.error).toBeUndefined();
  });

  it("lets the user acknowledge an error", async () => {
    const { result } = setup({
      hotkey: fakeHotkey({ register: vi.fn().mockRejectedValue(new Error("already in use")) }),
    });
    await waitFor(() => expect(result.current.error).toBe("already in use"));

    act(() => result.current.dismissError());

    expect(result.current.error).toBeUndefined();
  });
});
