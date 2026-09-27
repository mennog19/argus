import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClipboardWriter } from "../application/clipboard";
import { useClipboardCopy } from "./use-clipboard-copy";

function fakeWriter(): ClipboardWriter & { writeText: ReturnType<typeof vi.fn> } {
  return { writeText: vi.fn(async () => undefined) };
}

describe("useClipboardCopy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the value and marks the field as copied", async () => {
    const writer = fakeWriter();
    const { result } = renderHook(() => useClipboardCopy(writer, 20));

    await act(async () => {
      await result.current.copy("hunter2", "password");
    });

    expect(writer.writeText).toHaveBeenCalledWith("hunter2");
    expect(result.current.copiedField).toBe("password");
    expect(result.current.clearingField).toBe("password");
  });

  it("drops the copied confirmation while the countdown keeps running", async () => {
    const writer = fakeWriter();
    const { result } = renderHook(() => useClipboardCopy(writer, 20));

    await act(async () => {
      await result.current.copy("hunter2", "password");
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.copiedField).toBeUndefined();
    expect(result.current.clearingField).toBe("password");
  });

  it("wipes the clipboard when the countdown runs out", async () => {
    const writer = fakeWriter();
    const { result } = renderHook(() => useClipboardCopy(writer, 20));

    await act(async () => {
      await result.current.copy("hunter2", "password");
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(writer.writeText).toHaveBeenLastCalledWith("");
    expect(result.current.clearingField).toBeUndefined();
  });

  it("restarts the countdown on a second copy instead of letting the first wipe it", async () => {
    const writer = fakeWriter();
    const { result } = renderHook(() => useClipboardCopy(writer, 20));

    await act(async () => {
      await result.current.copy("alice", "username");
    });
    act(() => {
      vi.advanceTimersByTime(19_000);
    });
    await act(async () => {
      await result.current.copy("hunter2", "password");
    });

    // The first copy's countdown would have run out here; it must not wipe
    // the value that replaced it.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(writer.writeText).not.toHaveBeenLastCalledWith("");
    expect(result.current.clearingField).toBe("password");
    expect(result.current.clearingToken).toBe(2);

    act(() => {
      vi.advanceTimersByTime(19_000);
    });
    expect(writer.writeText).toHaveBeenLastCalledWith("");
  });

  it("wipes an outstanding secret immediately when the vault closes", async () => {
    const writer = fakeWriter();
    const { result, unmount } = renderHook(() => useClipboardCopy(writer, 20));

    await act(async () => {
      await result.current.copy("hunter2", "password");
    });
    unmount();

    expect(writer.writeText).toHaveBeenLastCalledWith("");
  });

  it("writes nothing on unmount when the countdown already wiped it", async () => {
    const writer = fakeWriter();
    const { result, unmount } = renderHook(() => useClipboardCopy(writer, 20));

    await act(async () => {
      await result.current.copy("hunter2", "password");
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    writer.writeText.mockClear();
    unmount();

    expect(writer.writeText).not.toHaveBeenCalled();
  });

  it("writes nothing on unmount when nothing was ever copied", () => {
    const writer = fakeWriter();
    const { unmount } = renderHook(() => useClipboardCopy(writer, 20));

    unmount();

    expect(writer.writeText).not.toHaveBeenCalled();
  });

  it("copies through the writer it was last given", async () => {
    const first = fakeWriter();
    const second = fakeWriter();
    const { result, rerender } = renderHook(
      ({ writer }: { writer: ClipboardWriter }) => useClipboardCopy(writer, 20),
      { initialProps: { writer: first as ClipboardWriter } },
    );

    rerender({ writer: second as ClipboardWriter });
    await act(async () => {
      await result.current.copy("hunter2", "password");
    });

    expect(first.writeText).not.toHaveBeenCalled();
    expect(second.writeText).toHaveBeenCalledWith("hunter2");
  });
});
