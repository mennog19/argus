import { describe, expect, it } from "vitest";
import { domainIdToKdbxUuid, kdbxUuidToDomainId } from "./kdbx-id";

describe("domainIdToKdbxUuid / kdbxUuidToDomainId", () => {
  it("round-trips a UUID through the KDBX uuid representation", () => {
    const id = crypto.randomUUID();
    expect(kdbxUuidToDomainId(domainIdToKdbxUuid(id))).toBe(id);
  });

  it("round-trips a fixed, non-random UUID", () => {
    const id = "01234567-89ab-cdef-0123-456789abcdef";
    expect(kdbxUuidToDomainId(domainIdToKdbxUuid(id))).toBe(id);
  });

  it("accepts uppercase-hex UUIDs", () => {
    const id = "01234567-89AB-CDEF-0123-456789ABCDEF";
    expect(() => domainIdToKdbxUuid(id)).not.toThrow();
  });

  it("rejects a string that isn't a dashed-hex UUID", () => {
    expect(() => domainIdToKdbxUuid("not-a-uuid")).toThrow("Not a valid UUID: not-a-uuid");
  });
});
