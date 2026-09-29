import { describe, expect, it } from "vitest";
import { CustomField } from "../../src/domain/custom-field";
import { CustomFields } from "../../src/domain/custom-fields";
import { Entry } from "../../src/domain/entry";
import { changedEntryFields } from "../../src/domain/entry-changes";
import { Icon } from "../../src/domain/icon";
import { Password } from "../../src/domain/password";
import { Tag } from "../../src/domain/tag";
import { Tags } from "../../src/domain/tags";

describe("changedEntryFields", () => {
  const base = Entry.create({
    title: "Bank",
    username: "alice",
    password: new Password("secret"),
    url: "https://bank.example",
    notes: "notes",
    tags: new Tags([new Tag("a"), new Tag("b")]),
    customFields: new CustomFields([
      new CustomField("PIN", "1234", true),
      new CustomField("X", "1"),
    ]),
    times: { modifiedAt: new Date("2026-01-01T00:00:00Z") },
  });

  it("finds nothing when only times differ", () => {
    expect(changedEntryFields(base, base.update({ times: { modifiedAt: new Date() } }))).toEqual(
      [],
    );
  });

  it("lists every changed field, in display order", () => {
    const changed = base.update({
      icon: Icon.brand("github"),
      notes: "other",
      url: "https://other.example",
      password: new Password("changed"),
      username: "bob",
      title: "Other",
      tags: new Tags([new Tag("a")]),
      customFields: new CustomFields([new CustomField("PIN", "1234", false)]),
    });

    expect(changedEntryFields(base, changed)).toEqual([
      "title",
      "username",
      "password",
      "url",
      "notes",
      "tags",
      "customFields",
      "icon",
    ]);
  });

  it("ignores the order tags and custom fields are listed in", () => {
    const reordered = base.update({
      tags: new Tags([new Tag("b"), new Tag("a")]),
      customFields: new CustomFields([
        new CustomField("X", "1"),
        new CustomField("PIN", "1234", true),
      ]),
    });

    expect(changedEntryFields(base, reordered)).toEqual([]);
  });

  it("notices a custom field value change", () => {
    const changed = base.update({
      customFields: base.customFields.set(new CustomField("X", "2")),
    });

    expect(changedEntryFields(base, changed)).toEqual(["customFields"]);
  });
});
