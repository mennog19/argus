/** Whether `timeoutMinutes` of inactivity has elapsed since `lastActivityAt`. */
export function hasIdleTimedOut(lastActivityAt: number, now: number, timeoutMinutes: number): boolean {
  return now - lastActivityAt >= timeoutMinutes * 60_000;
}

/**
 * Whether the actual gap since the last heartbeat tick is large enough to
 * mean the OS suspended the process (sleep/hibernate) rather than the
 * `setInterval` just running late — timers stall during sleep, so a real
 * suspend shows up as a much bigger gap than the interval itself.
 */
export function hasClockJumped(
  lastTickAt: number,
  now: number,
  intervalMs: number,
  toleranceMs: number,
): boolean {
  return now - lastTickAt > intervalMs + toleranceMs;
}
