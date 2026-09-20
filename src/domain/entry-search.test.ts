import { describe, expect, it } from "vitest";
import { CustomField } from "./custom-field";
import { CustomFields } from "./custom-fields";
import { Entry } from "./entry";
import { matchesSearchQuery } from "./entry-search";
import { Password } from "./password";
import { Tag } from "./tag";
import { Tags } from "./tags";

describe("matchesSearchQuery", () => {
  it("matches an empty query against every entry", () => {
    expect(matchesSearchQuery(Entry.create({ title: "GitHub" }), "")).toBe(true);
  });

  it("matches a whitespace-only query against every entry", () => {
    expect(matchesSearchQuery(Entry.create({ title: "GitHub" }), "   ")).toBe(true);
  });

  it("matches by title, case-insensitively", () => {
    const entry = Entry.create({ title: "GitHub" });

    expect(matchesSearchQuery(entry, "github")).toBe(true);
    expect(matchesSearchQuery(entry, "HUB")).toBe(true);
  });

  it("matches by username substring", () => {
    const entry = Entry.create({ title: "GitHub", username: "octocat" });

    expect(matchesSearchQuery(entry, "octo")).toBe(true);
  });

  it("matches by URL substring", () => {
    const entry = Entry.create({ title: "GitHub", url: "https://github.com" });

    expect(matchesSearchQuery(entry, "github.com")).toBe(true);
  });

  it("matches by notes substring", () => {
    const entry = Entry.create({ title: "GitHub", notes: "work account" });

    expect(matchesSearchQuery(entry, "work")).toBe(true);
  });

  it("matches by tag", () => {
    const entry = Entry.create({ title: "GitHub", tags: new Tags([new Tag("dev")]) });

    expect(matchesSearchQuery(entry, "dev")).toBe(true);
  });

  it("matches by custom field key", () => {
    const entry = Entry.create({
      title: "GitHub",
      customFields: new CustomFields([new CustomField("PIN", "1234")]),
    });

    expect(matchesSearchQuery(entry, "pin")).toBe(true);
  });

  it("matches by custom field value, including protected fields", () => {
    const entry = Entry.create({
      title: "GitHub",
      customFields: new CustomFields([new CustomField("Secret", "hunter2", true)]),
    });

    expect(matchesSearchQuery(entry, "hunter2")).toBe(true);
  });

  it("never matches the password", () => {
    const entry = Entry.create({ title: "GitHub", password: new Password("hunter2") });

    expect(matchesSearchQuery(entry, "hunter2")).toBe(false);
  });

  it("returns false when nothing matches", () => {
    const entry = Entry.create({
      title: "GitHub",
      username: "octocat",
      url: "https://github.com",
      notes: "work account",
      tags: new Tags([new Tag("dev")]),
      customFields: new CustomFields([new CustomField("PIN", "1234")]),
    });

    expect(matchesSearchQuery(entry, "nonexistent")).toBe(false);
  });
});
