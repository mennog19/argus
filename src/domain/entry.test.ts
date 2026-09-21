import { describe, expect, it } from "vitest";
import { CustomField } from "./custom-field";
import { CustomFields } from "./custom-fields";
import { Entry } from "./entry";
import { EntryIcon } from "./entry-icon";
import { EntryId } from "./entry-id";
import { Password } from "./password";
import { Tag } from "./tag";
import { Tags } from "./tags";

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
    expect(entry.icon).toBe(EntryIcon.AUTO);
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
    const entry = Entry.create({ icon: EntryIcon.library("star") });
    expect(entry.update({ title: "x" }).icon.equals(EntryIcon.library("star"))).toBe(true);
    expect(entry.update({ icon: EntryIcon.brand("github") }).icon.toString()).toBe("brand:github");
  });
});
