import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TotpConfig } from "../../src/domain";
import { useTotpCode } from "../../src/ui/use-totp-code";

const MAX_CRYPTO_TURNS = 100;

// The Web Crypto HMAC chain (importKey then sign) resolves over several real
// event-loop turns, not just one microtask — a single `advanceTimersByTimeAsync(0)`
// can race ahead of it. How many turns it needs varies with machine load, so pump
// them until `settled` holds rather than a fixed handful, capped so a genuine
// failure still fails instead of hanging. The cases that assert nothing arrives
// pass no predicate and simply burn the full budget.
async function flushCrypto(settled: () => boolean = () => false): Promise<void> {
  for (let turn = 0; turn < MAX_CRYPTO_TURNS && !settled(); turn++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

describe("useTotpCode", () => {
  beforeEach(() => {
    // Frozen, not auto-advancing: `advanceTimersByTimeAsync` still yields to the
    // real event loop for the crypto chain below, and a clock that only moves
    // when a test moves it keeps assertions on `secondsRemaining` from racing
    // real elapsed time across the 30-second boundary under parallel load.
    vi.useFakeTimers();
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
    await flushCrypto(() => result.current !== undefined);

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
    await flushCrypto(() => result.current !== undefined);
    const first = result.current!;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushCrypto(() => result.current !== first);

    expect(result.current!.secondsRemaining).toBe(first.secondsRemaining - 1);
  });

  it("rolls over to a new code once the period elapses", async () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);

    const { result } = renderHook(() => useTotpCode(config));
    await flushCrypto(() => result.current !== undefined);
    const first = result.current!;
    expect(first.secondsRemaining).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushCrypto(() => result.current !== first);

    expect(result.current!.secondsRemaining).toBe(30);
    expect(result.current!.value).not.toBe(first.value);
  });

  it("clears the code and stops ticking when the config becomes undefined", async () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);

    const { result, rerender } = renderHook(({ config }) => useTotpCode(config), {
      initialProps: { config: config as TotpConfig | undefined },
    });
    await flushCrypto(() => result.current !== undefined);
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
    await flushCrypto(() => result.current !== undefined);
    expect(result.current!.value).toHaveLength(6);
    const first = result.current!;

    rerender({ config: configB });
    await flushCrypto(() => result.current !== first);

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
    await flushCrypto(() => result.current !== undefined);
    const codeBeforeUnmount = result.current;

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current).toBe(codeBeforeUnmount);
  });
});
