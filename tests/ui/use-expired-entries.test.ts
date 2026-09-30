import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpiredEntryAction } from "../../src/application/settings";
import { Entry, Group, Vault } from "../../src/domain";
import { useExpiredEntries } from "../../src/ui/use-expired-entries";

const NOW = new Date("2026-06-01T12:00:00Z");

interface Session {
  readonly vault: Vault;
  readonly filePath: string;
}

function sessionWith(...entries: Entry[]): Session {
  const root = entries.reduce((group, entry) => group.addEntry(entry), Group.create("Root"));
  return { vault: new Vault("Root", root), filePath: "C:/vaults/mine.kdbx" };
}

function renderExpiry(
  session: Session | undefined,
  action: ExpiredEntryAction,
  save = vi.fn<(next: Vault, session: Session) => Promise<void>>().mockResolvedValue(undefined),
) {
  const rendered = renderHook(
    ({ session, action }) => {
      useExpiredEntries(session, action, save);
      // Counts renders, so a test can tell the hook re-rendered on expiry.
      return Date.now();
    },
    { initialProps: { session, action } },
  );
  return { ...rendered, save };
}

describe("useExpiredEntries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing while no vault is open", () => {
    const { save } = renderExpiry(undefined, "delete");

    expect(save).not.toHaveBeenCalled();
  });

  it("only marks expired entries, never saving, by default", () => {
    const session = sessionWith(Entry.create({ expiresAt: new Date(NOW.getTime() - 1) }));

    const { save } = renderExpiry(session, "mark");

    expect(save).not.toHaveBeenCalled();
  });

  it("recycles entries already expired on unlock, handing the session back", () => {
    const expired = Entry.create({ title: "Old", expiresAt: new Date(NOW.getTime() - 1) });
    const session = sessionWith(expired);

    const { save } = renderExpiry(session, "recycle");

    expect(save).toHaveBeenCalledTimes(1);
    const [next, handedBack] = save.mock.calls[0];
    expect(next.recycleBin!.entries).toEqual([expired]);
    expect(handedBack).toBe(session);
  });

  it("purges an entry the moment it expires while the vault is open", async () => {
    const expiring = Entry.create({ title: "Soon", expiresAt: new Date(NOW.getTime() + 60_000) });

    const { save } = renderExpiry(sessionWith(expiring), "delete");
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].purgedEntryIds).toEqual([expiring.id]);
  });

  it("re-renders when an entry expires, so its badge shows up", async () => {
    const session = sessionWith(Entry.create({ expiresAt: new Date(NOW.getTime() + 60_000) }));
    const { result } = renderExpiry(session, "mark");
    const before = result.current;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current).toBeGreaterThan(before);
  });

  it("waits in steps a timer can take for an expiry far in the future", async () => {
    const farOff = new Date(NOW.getTime() + 2 ** 31 + 1_000);
    const { save } = renderExpiry(sessionWith(Entry.create({ expiresAt: farOff })), "delete");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 ** 31 - 1);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("applies a newly chosen action to entries that already expired", () => {
    const session = sessionWith(Entry.create({ expiresAt: new Date(NOW.getTime() - 1) }));
    const { save, rerender } = renderExpiry(session, "mark");

    rerender({ session, action: "recycle" });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("writes once at a time, and tries again after a failed write", async () => {
    let fail: (cause: unknown) => void = () => {};
    const save = vi
      .fn<(next: Vault, session: Session) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
      )
      .mockResolvedValue(undefined);
    const session = sessionWith(Entry.create({ expiresAt: new Date(NOW.getTime() - 1) }));
    const { rerender } = renderExpiry(session, "recycle", save);

    // The vault changes (e.g. an entry was opened) while the first write is pending.
    rerender({ session: { ...session }, action: "recycle" });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      fail(new Error("conflict"));
    });
    rerender({ session: { ...session }, action: "recycle" });

    expect(save).toHaveBeenCalledTimes(2);
  });

  it("stops waiting for an expiry once the vault is closed", async () => {
    const session = sessionWith(Entry.create({ expiresAt: new Date(NOW.getTime() + 60_000) }));
    const { save, rerender } = renderExpiry(session, "delete");

    rerender({ session: undefined, action: "delete" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(save).not.toHaveBeenCalled();
  });
});
