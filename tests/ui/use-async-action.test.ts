import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAsyncAction } from "../../src/ui/use-async-action";

describe("useAsyncAction", () => {
  it("starts idle with nothing to report", () => {
    const { result } = renderHook(() => useAsyncAction());

    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it("reports success and stays quiet", async () => {
    const { result } = renderHook(() => useAsyncAction());

    let succeeded: boolean | undefined;
    await act(async () => {
      succeeded = await result.current.run(() => Promise.resolve());
    });

    expect(succeeded).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(result.current.busy).toBe(false);
  });

  it("is busy while the action is in flight", async () => {
    const { result } = renderHook(() => useAsyncAction());

    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    act(() => {
      void result.current.run(() => pending);
    });

    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.busy).toBe(false);
  });

  it("turns a rejection into an error message instead of propagating it", async () => {
    const { result } = renderHook(() => useAsyncAction());

    let succeeded: boolean | undefined;
    await act(async () => {
      succeeded = await result.current.run(() => Promise.reject(new Error("Disk is full")));
    });

    expect(succeeded).toBe(false);
    expect(result.current.error).toBe("Disk is full");
    expect(result.current.busy).toBe(false);
  });

  it("falls back to the given message when the cause carries none", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("")), "Couldn't move the entry.");
    });

    expect(result.current.error).toBe("Couldn't move the entry.");
  });

  it("falls back to a generic message when the caller gives none", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("")));
    });

    expect(result.current.error).toBe("Something went wrong.");
  });

  it("clears a previous error when the next run starts", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("Disk is full")));
    });
    await act(async () => {
      await result.current.run(() => Promise.resolve());
    });

    expect(result.current.error).toBeUndefined();
  });

  it("shows a message the caller produced itself", () => {
    const { result } = renderHook(() => useAsyncAction());

    act(() => result.current.fail("Group name is required."));

    expect(result.current.error).toBe("Group name is required.");
  });

  it("clears the error on request", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("Disk is full")));
    });
    act(() => result.current.clearError());

    expect(result.current.error).toBeUndefined();
  });
});
