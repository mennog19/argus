import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateTotpCode, TotpConfig } from "../../src/domain";
import { useTotpCode } from "../../src/ui/use-totp-code";

// Still the real implementation, only observed: the tests await the exact
// promises the hook started instead of guessing how many event-loop turns
// the Web Crypto HMAC chain needs, which varies with machine load.
vi.mock("../../src/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/domain")>();
  return { ...actual, generateTotpCode: vi.fn(actual.generateTotpCode) };
});

// Resolves every code generation the hook has kicked off so far, inside `act`
// so the resulting state updates are flushed. The hook's own `.then` was
// attached before ours, so its `setCode` has run by the time this returns.
async function flushCrypto(): Promise<void> {
  await act(async () => {
    await Promise.all(vi.mocked(generateTotpCode).mock.results.map((r) => r.value));
  });
}

describe("useTotpCode", () => {
  beforeEach(() => {
    vi.mocked(generateTotpCode).mockClear();
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
    const first = result.current!;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushCrypto();

    expect(result.current!.secondsRemaining).toBe(first.secondsRemaining - 1);
  });

  it("rolls over to a new code once the period elapses", async () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);

    const { result } = renderHook(() => useTotpCode(config));
    await flushCrypto();
    const first = result.current!;
    expect(first.secondsRemaining).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushCrypto();

    expect(result.current!.secondsRemaining).toBe(30);
    expect(result.current!.value).not.toBe(first.value);
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
    const first = result.current!;

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
