import { describe, expect, it } from "vitest";
import { basename, formatFileSize, formatRelativeTime } from "./format";

describe("basename", () => {
  it("returns the last segment of a forward-slash path", () => {
    expect(basename("C:/vaults/personal.kdbx")).toBe("personal.kdbx");
  });

  it("returns the last segment of a backslash path", () => {
    expect(basename("C:\\vaults\\personal.kdbx")).toBe("personal.kdbx");
  });

  it("ignores a trailing separator", () => {
    expect(basename("C:/vaults/personal.kdbx/")).toBe("personal.kdbx");
  });

  it("returns the original string when there are no separators", () => {
    expect(basename("personal.kdbx")).toBe("personal.kdbx");
  });

  it("returns the original string when nothing but separators remain", () => {
    expect(basename("///")).toBe("///");
  });
});

describe("formatFileSize", () => {
  it("formats sub-kilobyte sizes in bytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobyte-range sizes rounded to the nearest KB", () => {
    expect(formatFileSize(49152)).toBe("48 KB");
  });

  it("formats megabyte-range sizes to one decimal place", () => {
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("returns 'just now' for under a minute", () => {
    expect(formatRelativeTime("2026-01-01T11:59:30.000Z", now)).toBe("just now");
  });

  it("uses singular minute", () => {
    expect(formatRelativeTime("2026-01-01T11:59:00.000Z", now)).toBe("1 minute ago");
  });

  it("uses plural minutes", () => {
    expect(formatRelativeTime("2026-01-01T11:45:00.000Z", now)).toBe("15 minutes ago");
  });

  it("uses singular hour", () => {
    expect(formatRelativeTime("2026-01-01T11:00:00.000Z", now)).toBe("1 hour ago");
  });

  it("uses plural hours", () => {
    expect(formatRelativeTime("2026-01-01T06:00:00.000Z", now)).toBe("6 hours ago");
  });

  it("uses singular day", () => {
    expect(formatRelativeTime("2025-12-31T12:00:00.000Z", now)).toBe("1 day ago");
  });

  it("uses plural days", () => {
    expect(formatRelativeTime("2025-12-20T12:00:00.000Z", now)).toBe("12 days ago");
  });

  it("defaults `now` to the current time", () => {
    const iso = new Date().toISOString();
    expect(formatRelativeTime(iso)).toBe("just now");
  });
});
