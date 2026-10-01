import { describe, expect, it } from "vitest";
import { Attachment, Attachments } from "../../src/domain";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("Attachment", () => {
  it("keeps its name and bytes, and reports their size", () => {
    const data = bytes(1, 2, 3);
    const attachment = new Attachment("notes.txt", data);

    expect(attachment.name).toBe("notes.txt");
    expect(attachment.data).toBe(data);
    expect(attachment.size).toBe(3);
  });

  it("rejects a blank name", () => {
    expect(() => new Attachment("  ", bytes(1))).toThrow("An attachment needs a name.");
  });

  it("compares contents, not names or identity", () => {
    const shared = bytes(1, 2);
    const attachment = new Attachment("a.txt", shared);

    expect(attachment.hasSameData(new Attachment("b.txt", shared))).toBe(true);
    expect(attachment.hasSameData(new Attachment("a.txt", bytes(1, 2)))).toBe(true);
    expect(attachment.hasSameData(new Attachment("a.txt", bytes(1, 3)))).toBe(false);
    expect(attachment.hasSameData(new Attachment("a.txt", bytes(1, 2, 3)))).toBe(false);
  });
});

describe("Attachments", () => {
  const notes = new Attachment("notes.txt", bytes(1));
  const photo = new Attachment("photo.png", bytes(2));

  it("starts empty", () => {
    expect(Attachments.EMPTY.size).toBe(0);
    expect(Attachments.EMPTY.values).toEqual([]);
    expect(Attachments.EMPTY.get("notes.txt")).toBeUndefined();
    expect(Attachments.EMPTY.has("notes.txt")).toBe(false);
  });

  it("holds attachments by name, in the order given", () => {
    const attachments = new Attachments([notes, photo]);

    expect(attachments.size).toBe(2);
    expect(attachments.values).toEqual([notes, photo]);
    expect(attachments.get("photo.png")).toBe(photo);
    expect(attachments.has("notes.txt")).toBe(true);
  });

  describe("availableName", () => {
    it("is the name itself when nothing uses it", () => {
      expect(new Attachments([notes]).availableName("photo.png")).toBe("photo.png");
    });

    it("numbers a taken name before its extension", () => {
      const attachments = new Attachments([notes, new Attachment("notes (2).txt", bytes(3))]);

      expect(attachments.availableName("notes.txt")).toBe("notes (3).txt");
    });

    it("numbers the end of a name that has no extension", () => {
      const attachments = new Attachments([
        new Attachment("README", bytes(1)),
        new Attachment(".env", bytes(2)),
      ]);

      expect(attachments.availableName("README")).toBe("README (2)");
      expect(attachments.availableName(".env")).toBe(".env (2)");
    });
  });

  it("attaches a file under its own name, or the next free one", () => {
    const attachments = new Attachments([notes]);

    const added = attachments.attach(photo).attach(new Attachment("notes.txt", bytes(9)));

    expect(added.values.map((attachment) => attachment.name)).toEqual([
      "notes.txt",
      "photo.png",
      "notes (2).txt",
    ]);
    expect(added.get("notes.txt")).toBe(notes);
    expect(added.get("notes (2).txt")?.data).toEqual(bytes(9));
    expect(attachments.size).toBe(1);
  });

  describe("rename", () => {
    const attachments = new Attachments([notes, photo]);

    it("renames in place, keeping the bytes and the order", () => {
      const renamed = attachments.rename("notes.txt", "todo.txt");

      expect(renamed.values.map((attachment) => attachment.name)).toEqual([
        "todo.txt",
        "photo.png",
      ]);
      expect(renamed.get("todo.txt")?.data).toBe(notes.data);
    });

    it("changes nothing for the same name or one it doesn't have", () => {
      expect(attachments.rename("notes.txt", "notes.txt")).toBe(attachments);
      expect(attachments.rename("missing.txt", "other.txt")).toBe(attachments);
    });

    it("refuses a name another attachment has, or a blank one", () => {
      expect(() => attachments.rename("notes.txt", "photo.png")).toThrow(
        'There\'s already an attachment named "photo.png".',
      );
      expect(() => attachments.rename("notes.txt", "")).toThrow("An attachment needs a name.");
    });
  });

  it("removes by name, and changes nothing for a name it doesn't have", () => {
    const attachments = new Attachments([notes, photo]);

    expect(attachments.remove("notes.txt").values).toEqual([photo]);
    expect(attachments.remove("missing.txt")).toBe(attachments);
  });

  describe("merge", () => {
    it("adds what the other set has and this one lacks", () => {
      const merged = new Attachments([notes]).merge(new Attachments([photo]));

      expect(merged.values).toEqual([notes, photo]);
    });

    it("skips a file it already has under the same name", () => {
      const attachments = new Attachments([notes]);

      expect(attachments.merge(new Attachments([new Attachment("notes.txt", bytes(1))]))).toBe(
        attachments,
      );
    });

    it("keeps both when the same name holds different contents", () => {
      const merged = new Attachments([notes]).merge(
        new Attachments([new Attachment("notes.txt", bytes(7))]),
      );

      expect(merged.get("notes.txt")).toBe(notes);
      expect(merged.get("notes (2).txt")?.data).toEqual(bytes(7));
    });
  });

  describe("equals", () => {
    it("ignores order and compares contents", () => {
      const copy = new Attachments([
        new Attachment("photo.png", bytes(2)),
        new Attachment("notes.txt", bytes(1)),
      ]);

      expect(new Attachments([notes, photo]).equals(copy)).toBe(true);
    });

    it("notices a missing, renamed or changed file", () => {
      const attachments = new Attachments([notes, photo]);

      expect(attachments.equals(new Attachments([notes]))).toBe(false);
      expect(attachments.equals(attachments.rename("photo.png", "pic.png"))).toBe(false);
      expect(
        attachments.equals(new Attachments([notes, new Attachment("photo.png", bytes(5))])),
      ).toBe(false);
    });
  });
});
