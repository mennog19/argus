import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Updater } from "../../src/application/updater";
import { useLaunchUpdateCheck } from "../../src/ui/use-launch-update-check";

function fakeUpdater(overrides: Partial<Updater> = {}): Updater {
  return {
    checkForUpdate: vi.fn().mockResolvedValue(undefined),
    installUpdate: vi.fn(),
    ...overrides,
  };
}

const UPDATE = { version: "0.2.0", currentVersion: "0.1.0" };

describe("useLaunchUpdateCheck", () => {
  it("doesn't check until asked to", () => {
    const updater = fakeUpdater();

    renderHook(() => useLaunchUpdateCheck(updater));

    expect(updater.checkForUpdate).not.toHaveBeenCalled();
  });

  it("offers the update a check finds", async () => {
    const updater = fakeUpdater({ checkForUpdate: vi.fn().mockResolvedValue(UPDATE) });
    const { result } = renderHook(() => useLaunchUpdateCheck(updater));

    await act(async () => result.current.check());

    expect(result.current.update).toEqual(UPDATE);
  });

  it("offers nothing when Argus is up to date", async () => {
    const updater = fakeUpdater();
    const { result } = renderHook(() => useLaunchUpdateCheck(updater));

    await act(async () => result.current.check());

    expect(result.current.update).toBeUndefined();
  });

  it("stays quiet when the check fails", async () => {
    const updater = fakeUpdater({ checkForUpdate: vi.fn().mockRejectedValue("offline") });
    const { result } = renderHook(() => useLaunchUpdateCheck(updater));

    await act(async () => result.current.check());

    expect(result.current.update).toBeUndefined();
  });

  it("only ever checks once", async () => {
    const updater = fakeUpdater();
    const { result, rerender } = renderHook(() => useLaunchUpdateCheck(updater));

    await act(async () => result.current.check());
    rerender();
    await act(async () => result.current.check());

    expect(updater.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("forgets the update once dismissed", async () => {
    const updater = fakeUpdater({ checkForUpdate: vi.fn().mockResolvedValue(UPDATE) });
    const { result } = renderHook(() => useLaunchUpdateCheck(updater));
    await act(async () => result.current.check());

    act(() => result.current.dismiss());

    expect(result.current.update).toBeUndefined();
  });
});
