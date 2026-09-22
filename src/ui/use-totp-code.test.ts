import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TotpConfig } from "../domain";
import { useTotpCode } from "./use-totp-code";

// The Web Crypto HMAC chain (importKey then sign) resolves over several real
// event-loop turns, not just one microtask — a single `advanceTimersByTimeAsync(0)`
// can race ahead of it, so flush a handful of turns to let it settle.
async function flushCrypto(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

describe("useTotpCode", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(59 * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined when there is no config", () => {
    const { result } = renderHook(() => useTotpCode(undefined));

    expect(result.current).toBeUndefined();
  });

  it("computes the current code immediately", async () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);

    const { result } = renderHook(() => useTotpCode(config));
    await flushCrypto();

    expect(result.current).toBeDefined();
    expect(result.current!.value).toMatch(/^\d{6}$/);
    expect(result.current!.secondsRemaining).toBe(1);
  });

  it("refreshes the code and countdown every second", async () => {
    // Mid-period, away from the 30s rollover boundary, so the remaining
    // count simply decrements rather than wrapping back up to 30.
    vi.setSystemTime(new Date(40 * 1000));
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);

    const { result } = renderHook(() => useTotpCode(config));
    await flushCrypto();
    const firstRemaining = result.current!.secondsRemaining;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushCrypto();

    expect(result.current!.secondsRemaining).toBe(firstRemaining - 1);
  });

  it("rolls over to a new code once the period elapses", async () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);

    const { result } = renderHook(() => useTotpCode(config));
    await flushCrypto();
    expect(result.current!.secondsRemaining).toBe(1);
    const firstCode = result.current!.value;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushCrypto();

    expect(result.current!.secondsRemaining).toBe(30);
    expect(result.current!.value).not.toBe(firstCode);
  });

  it("clears the code and stops ticking when the config becomes undefined", async () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);

    const { result, rerender } = renderHook(({ config }) => useTotpCode(config), {
      initialProps: { config: config as TotpConfig | undefined },
    });
    await flushCrypto();
    expect(result.current).toBeDefined();

    rerender({ config: undefined });

    expect(result.current).toBeUndefined();
  });

  it("switches to the new config's code when config changes", async () => {
    const configA = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);
    const configB = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 8, 30);

    const { result, rerender } = renderHook(({ config }) => useTotpCode(config), {
      initialProps: { config: configA },
    });
    await flushCrypto();
    expect(result.current!.value).toHaveLength(6);

    rerender({ config: configB });
    await flushCrypto();

    expect(result.current!.value).toHaveLength(8);
  });

  it("ignores a pending code once unmounted before the crypto call resolves", async () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);

    const { result, unmount } = renderHook(() => useTotpCode(config));
    unmount();
    await flushCrypto();

    expect(result.current).toBeUndefined();
  });

  it("stops updating after unmount", async () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);

    const { result, unmount } = renderHook(() => useTotpCode(config));
    await flushCrypto();
    const codeBeforeUnmount = result.current;

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current).toBe(codeBeforeUnmount);
  });
});
