import { describe, expect, it } from "vitest";
import { CustomField } from "../../src/domain/custom-field";
import { CustomFields } from "../../src/domain/custom-fields";
import { Entry } from "../../src/domain/entry";
import { EntryId } from "../../src/domain/entry-id";
import { FieldReferences, isFieldReference } from "../../src/domain/field-references";
import { Password } from "../../src/domain/password";

const TARGET_ID = "0f8e2c4a-1b3d-4e5f-a6b7-c8d9e0f1a2b3";
const TARGET_HEX = "0F8E2C4A1B3D4E5FA6B7C8D9E0F1A2B3";

const target = new Entry(EntryId.fromString(TARGET_ID), {
  title: "Google",
  username: "me@gmail.com",
  password: new Password("hunter2"),
  url: "https://accounts.google.com",
  notes: "main account",
  customFields: new CustomFields([new CustomField("Recovery", "R-123")]),
});

describe("FieldReferences", () => {
  describe("resolve", () => {
    const references = new FieldReferences([target]);

    it("resolves each wanted field of an entry found by its uuid, as KeePassXC writes them", () => {
      expect(references.resolve(`{REF:T@I:${TARGET_HEX}}`)).toBe("Google");
      expect(references.resolve(`{REF:U@I:${TARGET_HEX}}`)).toBe("me@gmail.com");
      expect(references.resolve(`{REF:P@I:${TARGET_HEX}}`)).toBe("hunter2");
      expect(references.resolve(`{REF:A@I:${TARGET_HEX}}`)).toBe("https://accounts.google.com");
      expect(references.resolve(`{REF:N@I:${TARGET_HEX}}`)).toBe("main account");
      expect(references.resolve(`{REF:I@T:Google}`)).toBe(TARGET_HEX);
    });

    it("matches the uuid and the field letters case-insensitively, dashes or not", () => {
      expect(references.resolve(`{ref:p@i:${TARGET_HEX.toLowerCase()}}`)).toBe("hunter2");
      expect(references.resolve(`{REF:P@I:${TARGET_ID}}`)).toBe("hunter2");
    });

    it("finds the entry by any searchable field, compared whole and case-insensitively", () => {
      expect(references.resolve("{REF:P@T:google}")).toBe("hunter2");
      expect(references.resolve("{REF:P@U:ME@gmail.com}")).toBe("hunter2");
      expect(references.resolve("{REF:U@P:hunter2}")).toBe("me@gmail.com");
      expect(references.resolve("{REF:P@A:https://accounts.google.com}")).toBe("hunter2");
      expect(references.resolve("{REF:P@N:Main Account}")).toBe("hunter2");
      expect(references.resolve("{REF:P@O:r-123}")).toBe("hunter2");
      expect(references.resolve("{REF:P@T:Goog}")).toBe("{REF:P@T:Goog}");
    });

    it("replaces references embedded in surrounding text, and several in one value", () => {
      expect(references.resolve(`user {REF:U@I:${TARGET_HEX}} / {REF:T@I:${TARGET_HEX}}!`)).toBe(
        "user me@gmail.com / Google!",
      );
    });

    it("leaves a reference that finds no entry, or isn't well-formed, as it was", () => {
      const missing = "{REF:P@I:00000000000000000000000000000000}";
      expect(references.resolve(missing)).toBe(missing);
      expect(references.resolve("{REF:X@I:abc}")).toBe("{REF:X@I:abc}");
      expect(references.resolve("{REF:P@I:}")).toBe("{REF:P@I:}");
      expect(references.resolve("plain text")).toBe("plain text");
    });

    it("uses the first entry that matches when several do", () => {
      const first = Entry.create({ title: "Shared", password: new Password("one") });
      const second = Entry.create({ title: "Shared", password: new Password("two") });

      expect(new FieldReferences([first, second]).resolve("{REF:P@T:Shared}")).toBe("one");
    });

    it("follows a chain of references", () => {
      const middle = Entry.create({
        title: "Middle",
        password: new Password(`{REF:P@I:${TARGET_HEX}}`),
      });

      expect(new FieldReferences([target, middle]).resolve("{REF:P@T:Middle}")).toBe("hunter2");
    });

    it("gives up on a cycle instead of looping forever, leaving the reference text", () => {
      const loop = Entry.create({ title: "Loop", password: new Password("{REF:P@T:Loop}") });

      expect(new FieldReferences([loop]).resolve("{REF:P@T:Loop}")).toBe("{REF:P@T:Loop}");
    });
  });

  describe("resolveEntry", () => {
    it("returns a copy with every text field resolved, keeping id and the rest", () => {
      const linked = Entry.create({
        title: `Copy of {REF:T@I:${TARGET_HEX}}`,
        username: `{REF:U@I:${TARGET_HEX}}`,
        password: new Password(`{REF:P@I:${TARGET_HEX}}`),
        url: `{REF:A@I:${TARGET_HEX}}`,
        notes: `{REF:N@I:${TARGET_HEX}}`,
        customFields: new CustomFields([
          new CustomField("Code", `{REF:O@I:${TARGET_HEX}}`),
          new CustomField("Secret", `{REF:P@I:${TARGET_HEX}}`, true),
        ]),
      });

      const resolved = new FieldReferences([target, linked]).resolveEntry(linked);

      expect(resolved.id.equals(linked.id)).toBe(true);
      expect(resolved.title).toBe("Copy of Google");
      expect(resolved.username).toBe("me@gmail.com");
      expect(resolved.password.reveal()).toBe("hunter2");
      expect(resolved.url).toBe("https://accounts.google.com");
      expect(resolved.notes).toBe("main account");
      // O is only a place to search in, never a field to fetch.
      expect(resolved.customFields.get("Code")?.value).toBe(`{REF:O@I:${TARGET_HEX}}`);
      expect(resolved.customFields.get("Secret")?.value).toBe("hunter2");
      expect(resolved.customFields.get("Secret")?.isProtected).toBe(true);
    });

    it("hands back the very same entry when nothing in it is a reference", () => {
      expect(new FieldReferences([target]).resolveEntry(target)).toBe(target);
    });
  });
});

describe("isFieldReference", () => {
  it("is true only for a value that contains a reference", () => {
    expect(isFieldReference(`{REF:P@I:${TARGET_HEX}}`)).toBe(true);
    expect(isFieldReference(`x{ref:u@t:Google}y`)).toBe(true);
    expect(isFieldReference("hunter2")).toBe(false);
    expect(isFieldReference("{REF:bogus}")).toBe(false);
  });
});
