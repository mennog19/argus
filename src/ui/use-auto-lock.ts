import { useEffect, useRef } from "react";
import { AutoLockSettings } from "../application/settings";
import { WindowEvents } from "../application/window-events";
import { hasClockJumped, hasIdleTimedOut } from "./auto-lock";

const IDLE_CHECK_INTERVAL_MS = 10_000;
const SLEEP_CHECK_INTERVAL_MS = 15_000;
const SLEEP_CLOCK_JUMP_TOLERANCE_MS = 10_000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "scroll"] as const;

/**
 * Calls `onLock` with `session` when any enabled auto-lock trigger fires:
 * inactivity, the system sleeping, or the window being minimized.
 *
 * `session` restarts every trigger when it changes — the idle clock starts
 * over for a freshly unlocked or freshly saved vault — and `undefined` means
 * there's nothing unlocked to lock.
 */
export function useAutoLock<Session extends object>(
  session: Session | undefined,
  settings: AutoLockSettings,
  windowEvents: WindowEvents,
  onLock: (session: Session) => void,
): void {
  // Read through a ref so a caller passing a fresh callback each render
  // doesn't restart the idle clock on every render.
  const onLockRef = useRef(onLock);
  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  useEffect(() => {
    if (session === undefined) {
      return;
    }
    const lock = () => onLockRef.current(session);
    const cleanups: (() => void)[] = [];

    if (settings.idleTimeoutMinutes !== undefined) {
      const timeoutMinutes = settings.idleTimeoutMinutes;
      let lastActivityAt = Date.now();
      const markActivity = () => {
        lastActivityAt = Date.now();
      };
      for (const eventName of ACTIVITY_EVENTS) {
        window.addEventListener(eventName, markActivity);
      }
      const intervalId = setInterval(() => {
        if (hasIdleTimedOut(lastActivityAt, Date.now(), timeoutMinutes)) {
          lock();
        }
      }, IDLE_CHECK_INTERVAL_MS);
      cleanups.push(() => {
        for (const eventName of ACTIVITY_EVENTS) {
          window.removeEventListener(eventName, markActivity);
        }
        clearInterval(intervalId);
      });
    }

    if (settings.lockOnSleep) {
      let lastTickAt = Date.now();
      const intervalId = setInterval(() => {
        const now = Date.now();
        if (
          hasClockJumped(lastTickAt, now, SLEEP_CHECK_INTERVAL_MS, SLEEP_CLOCK_JUMP_TOLERANCE_MS)
        ) {
          lock();
        }
        lastTickAt = now;
      }, SLEEP_CHECK_INTERVAL_MS);
      cleanups.push(() => clearInterval(intervalId));
    }

    if (settings.lockOnMinimize) {
      cleanups.push(windowEvents.onMinimize(lock));
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [session, settings, windowEvents]);
}
