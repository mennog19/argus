import { describe, expect, it } from "vitest";
import { Attachment, Attachments } from "../../src/domain/attachment";
import { CustomField } from "../../src/domain/custom-field";
import { CustomFields } from "../../src/domain/custom-fields";
import { Entry } from "../../src/domain/entry";
import { Icon } from "../../src/domain/icon";
import { EntryId } from "../../src/domain/entry-id";
import { Password } from "../../src/domain/password";
import { Tag } from "../../src/domain/tag";
import { Tags } from "../../src/domain/tags";

describe("Entry", () => {
  it("defaults every field when created with none", () => {
    const entry = Entry.create();

    expect(entry.title).toBe("");
    expect(entry.username).toBe("");
    expect(entry.password.reveal()).toBe("");
    expect(entry.url).toBe("");
    expect(entry.notes).toBe("");
    expect(entry.tags.values).toEqual([]);
    expect(entry.customFields.values).toEqual([]);
    expect(entry.icon).toBe(Icon.AUTO);
  });

  it("creates an entry with the given fields and a fresh id", () => {
    const password = new Password("hunter2");
    const tags = new Tags([new Tag("work")]);
    const customFields = new CustomFields([new CustomField("PIN", "1234")]);

    const entry = Entry.create({
      title: "Bank",
      username: "alice",
      password,
      url: "https://bank.example",
      notes: "primary account",
      tags,
      customFields,
    });

    expect(entry.id).toBeInstanceOf(EntryId);
    expect(entry.title).toBe("Bank");
    expect(entry.username).toBe("alice");
    expect(entry.password.equals(password)).toBe(true);
    expect(entry.url).toBe("https://bank.example");
    expect(entry.notes).toBe("primary account");
    expect(entry.tags).toBe(tags);
    expect(entry.customFields).toBe(customFields);
  });

  it("two entries with the same id are equal regardless of field values", () => {
    const id = EntryId.create();
    const a = new Entry(id, { title: "A" });
    const b = new Entry(id, { title: "B" });

    expect(a.equals(b)).toBe(true);
  });

  it("two entries with different ids are not equal", () => {
    expect(Entry.create().equals(Entry.create())).toBe(false);
  });

  it("update returns a new entry preserving identity and unspecified fields", () => {
    const original = Entry.create({ title: "Old", username: "alice" });
    const updated = original.update({ title: "New" });

    expect(updated).not.toBe(original);
    expect(updated.id.equals(original.id)).toBe(true);
    expect(updated.title).toBe("New");
    expect(updated.username).toBe("alice");
    expect(original.title).toBe("Old");
  });

  it("update leaves the title untouched when it isn't specified", () => {
    const original = Entry.create({ title: "Unchanged" });
    const updated = original.update({ username: "bob" });

    expect(updated.title).toBe("Unchanged");
    expect(updated.username).toBe("bob");
  });

  it("carries an icon choice through update, keeping it when unspecified", () => {
    const entry = Entry.create({ icon: Icon.library("star") });
    expect(entry.update({ title: "x" }).icon.equals(Icon.library("star"))).toBe(true);
    expect(entry.update({ icon: Icon.brand("github") }).icon.toString()).toBe("brand:github");
  });

  it("has no timestamps until something supplies them", () => {
    expect(Entry.create({ title: "Fresh" }).times).toEqual({});
  });

  it("carries timestamps through update, keeping them when unspecified", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const entry = Entry.create({ title: "Mail", times: { createdAt } });

    expect(entry.update({ title: "Webmail" }).times).toEqual({ createdAt });
    expect(entry.update({ times: {} }).times).toEqual({});
  });

  it("markAccessed records when the entry was opened, leaving other times alone", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const openedAt = new Date("2026-02-02T09:30:00Z");
    const entry = Entry.create({ title: "Mail", times: { createdAt } });

    const opened = entry.markAccessed(openedAt);

    expect(opened.times).toEqual({ createdAt, accessedAt: openedAt });
    expect(opened.id.equals(entry.id)).toBe(true);
    expect(entry.times.accessedAt).toBeUndefined();
  });
});

describe("Entry history", () => {
  const firstVersion = new Date("2026-01-01T10:00:00Z");
  const secondVersion = new Date("2026-02-01T10:00:00Z");

  function entryWithHistory() {
    const id = EntryId.create();
    const oldest = new Entry(id, {
      title: "Bank",
      password: new Password("first-pass"),
      url: "https://old.example",
      times: { modifiedAt: firstVersion },
    });
    const middle = oldest.update({
      password: new Password("second-pass"),
      times: { modifiedAt: secondVersion },
    });
    const current = middle.update({
      title: "Bank (main)",
      password: new Password("third-pass"),
      notes: "current notes",
      tags: new Tags([new Tag("finance")]),
      customFields: new CustomFields([new CustomField("PIN", "1234", true)]),
      attachments: new Attachments([new Attachment("statement.pdf", new Uint8Array([1]))]),
      icon: Icon.brand("github"),
      history: [oldest, middle],
    });
    return { oldest, middle, current };
  }

  it("has no history by default", () => {
    expect(Entry.create().history).toEqual([]);
  });

  it("has no attachments by default, and keeps them across edits", () => {
    const { current } = entryWithHistory();

    expect(Entry.create().attachments.size).toBe(0);
    expect(current.update({ title: "Renamed" }).attachments).toBe(current.attachments);
  });

  it("keeps its history across edits", () => {
    const { oldest, middle, current } = entryWithHistory();

    expect(current.update({ title: "Renamed" }).history).toEqual([oldest, middle]);
  });

  it("restores a revision's contents, keeping its own id, times and history", () => {
    const { oldest, current } = entryWithHistory();

    const restored = current.restoreRevision(0);

    expect(restored.id.equals(current.id)).toBe(true);
    expect(restored.title).toBe("Bank");
    expect(restored.password.reveal()).toBe("first-pass");
    expect(restored.url).toBe("https://old.example");
    expect(restored.notes).toBe("");
    expect(restored.tags.values).toEqual([]);
    expect(restored.customFields.values).toEqual([]);
    expect(restored.attachments.values).toEqual([]);
    expect(restored.icon).toBe(oldest.icon);
    expect(restored.times).toBe(current.times);
    expect(restored.history).toBe(current.history);
  });

  it("deletes one revision and keeps the others in order", () => {
    const { oldest, middle, current } = entryWithHistory();

    expect(current.deleteRevision(0).history).toEqual([middle]);
    expect(current.deleteRevision(1).history).toEqual([oldest]);
    expect(current.history).toEqual([oldest, middle]);
  });

  it("rejects a revision index it doesn't have", () => {
    const { current } = entryWithHistory();

    expect(() => current.restoreRevision(2)).toThrow("No revision 2");
    expect(() => current.deleteRevision(-1)).toThrow("No revision -1");
  });

  describe("expiry", () => {
    const EXPIRY = new Date("2026-06-01T12:00:00Z");

    it("has no expiry date unless given one", () => {
      expect(Entry.create().expiresAt).toBeUndefined();
      expect(Entry.create().isExpired(new Date())).toBe(false);
    });

    it("is expired from its expiry date on, not before", () => {
      const entry = Entry.create({ expiresAt: EXPIRY });

      expect(entry.isExpired(new Date(EXPIRY.getTime() - 1))).toBe(false);
      expect(entry.isExpired(EXPIRY)).toBe(true);
      expect(entry.isExpired(new Date(EXPIRY.getTime() + 1))).toBe(true);
    });

    it("keeps its expiry date through an update that doesn't mention it", () => {
      const entry = Entry.create({ expiresAt: EXPIRY }).update({ title: "Renamed" });

      expect(entry.expiresAt).toBe(EXPIRY);
    });

    it("changes or clears its expiry date through an update that passes one", () => {
      const later = new Date("2027-01-01T00:00:00Z");
      const entry = Entry.create({ expiresAt: EXPIRY });

      expect(entry.update({ expiresAt: later }).expiresAt).toBe(later);
      expect(entry.update({ expiresAt: undefined }).expiresAt).toBeUndefined();
    });

    it("brings back a revision's expiry date on restore", () => {
      const revision = Entry.create({ title: "Old", expiresAt: EXPIRY });
      const entry = new Entry(revision.id, { title: "New", history: [revision] });

      expect(entry.restoreRevision(0).expiresAt).toBe(EXPIRY);
      expect(
        new Entry(revision.id, {
          expiresAt: EXPIRY,
          history: [revision.update({ expiresAt: undefined })],
        }).restoreRevision(0).expiresAt,
      ).toBeUndefined();
    });
  });
});
