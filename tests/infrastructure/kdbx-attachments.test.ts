// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Credentials, Kdbx, KdbxBinaryWithHash, ProtectedValue } from "kdbxweb";
import { Attachment, Attachments, Entry, Group, Vault } from "../../src/domain";
import { KdbxAttachmentStore } from "../../src/infrastructure/kdbx-attachments";
import { configureKdbxCrypto } from "../../src/infrastructure/kdbx-crypto";
import { applyVaultToKdbx, vaultFromKdbx } from "../../src/infrastructure/kdbx-mapper";

function createDb(): Kdbx {
  return Kdbx.create(new Credentials(null), "Test Vault");
}

function bufferOf(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

/** A document with one entry holding a pooled, an inline and a protected binary. */
async function dbWithAttachments() {
  const db = createDb();
  const kdbxEntry = db.createEntry(db.getDefaultGroup());
  kdbxEntry.fields.set("Title", "Bank");
  kdbxEntry.binaries.set("pooled.bin", await db.createBinary(bufferOf(1, 2, 3)));
  kdbxEntry.binaries.set("inline.bin", bufferOf(4, 5));
  kdbxEntry.binaries.set(
    "secret.txt",
    await db.createBinary(ProtectedValue.fromString("protected")),
  );
  return { db, kdbxEntry };
}

function onlyEntry(vault: Vault): Entry {
  return vault.rootGroup.entries[0];
}

describe("KdbxAttachmentStore", () => {
  it("maps an entry's binaries, whichever way the document holds them", async () => {
    const { db } = await dbWithAttachments();

    const { attachments } = onlyEntry(vaultFromKdbx(db));

    expect(attachments.values.map((attachment) => attachment.name)).toEqual([
      "pooled.bin",
      "inline.bin",
      "secret.txt",
    ]);
    expect(attachments.get("pooled.bin")?.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(attachments.get("inline.bin")?.data).toEqual(new Uint8Array([4, 5]));
    expect(new TextDecoder().decode(attachments.get("secret.txt")?.data)).toBe("protected");
  });

  it("maps history revisions' binaries too, sharing the bytes of a shared file", async () => {
    const { db, kdbxEntry } = await dbWithAttachments();
    kdbxEntry.pushHistory();
    kdbxEntry.binaries.delete("pooled.bin");

    const entry = onlyEntry(vaultFromKdbx(db));

    expect(entry.attachments.has("pooled.bin")).toBe(false);
    expect(entry.history[0].attachments.has("pooled.bin")).toBe(true);
    expect(entry.history[0].attachments.get("secret.txt")?.data).toBe(
      entry.attachments.get("secret.txt")?.data,
    );
  });

  it("hands out the same bytes every time the same store maps the document", async () => {
    const { db } = await dbWithAttachments();
    const store = new KdbxAttachmentStore();

    const first = onlyEntry(vaultFromKdbx(db, store)).attachments;
    const second = onlyEntry(vaultFromKdbx(db, store)).attachments;

    for (const attachment of first.values) {
      expect(second.get(attachment.name)?.data).toBe(attachment.data);
    }
  });

  it("leaves the binaries alone when the attachments didn't change", async () => {
    const { db, kdbxEntry } = await dbWithAttachments();
    const before = new Map(kdbxEntry.binaries);
    const vault = vaultFromKdbx(db);

    // A second, unrelated store: nothing is recognised by identity, only by contents.
    applyVaultToKdbx(db, vault.updateEntry(onlyEntry(vault).update({ title: "Renamed" })));

    expect(kdbxEntry.fields.get("Title")).toBe("Renamed");
    expect([...kdbxEntry.binaries]).toEqual([...before]);
    for (const [name, binary] of before) {
      expect(kdbxEntry.binaries.get(name)).toBe(binary);
    }
  });

  it("pools a new file and writes it into the entry, pushing a history revision", async () => {
    const { db, kdbxEntry } = await dbWithAttachments();
    const secret = kdbxEntry.binaries.get("secret.txt");
    const store = new KdbxAttachmentStore();
    const vault = vaultFromKdbx(db, store);
    const added = new Attachment("new.txt", new Uint8Array([9, 9]));
    const next = vault.updateEntry(
      onlyEntry(vault).update({ attachments: onlyEntry(vault).attachments.attach(added) }),
    );

    await store.prepare(db, next);
    applyVaultToKdbx(db, next, store);

    const binary = kdbxEntry.binaries.get("new.txt") as KdbxBinaryWithHash;
    expect(new Uint8Array(binary.value as ArrayBuffer)).toEqual(new Uint8Array([9, 9]));
    expect(db.binaries.getValueByHash(binary.hash)).toBe(binary.value);
    // The files that were already there are still the binaries kdbxweb parsed.
    expect(kdbxEntry.binaries.get("secret.txt")).toBe(secret);
    expect([...kdbxEntry.history[0].binaries.keys()]).toEqual([
      "pooled.bin",
      "inline.bin",
      "secret.txt",
    ]);
    // Mapping again yields the very bytes that were added, so the next save sees no change.
    expect(onlyEntry(vaultFromKdbx(db, store)).attachments.get("new.txt")?.data).toBe(added.data);
  });

  it("keeps the document's copy apart from the bytes the vault holds", async () => {
    const db = createDb();
    const store = new KdbxAttachmentStore();
    const data = new Uint8Array([1, 2, 3]);
    const entry = Entry.create({
      title: "Bank",
      attachments: new Attachments([new Attachment("a.bin", data)]),
    });
    const vault = vaultFromKdbx(db, store);
    const next = vault.addEntry(vault.rootGroup.id, entry);

    await store.prepare(db, next);
    applyVaultToKdbx(db, next, store);
    data[0] = 99;

    const binary = db.getDefaultGroup().entries[0].binaries.get("a.bin") as KdbxBinaryWithHash;
    expect(new Uint8Array(binary.value as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("prepares files in nested groups, and each file's bytes only once", async () => {
    const db = createDb();
    const store = new KdbxAttachmentStore();
    const data = new Uint8Array([7]);
    const first = Entry.create({ attachments: new Attachments([new Attachment("a", data)]) });
    const second = Entry.create({ attachments: new Attachments([new Attachment("b", data)]) });
    const mapped = vaultFromKdbx(db, store);
    const vault = mapped
      .addGroup(mapped.rootGroup.id, Group.create("Nested").addEntry(second))
      .addEntry(mapped.rootGroup.id, first);

    await store.prepare(db, vault);
    await store.prepare(db, vault);
    applyVaultToKdbx(db, vault, store);

    const [a, b] = [...db.getDefaultGroup().allEntries()].flatMap((kdbxEntry) => [
      ...kdbxEntry.binaries.values(),
    ]);
    expect(a).toBe(b);
    expect(db.binaries.getAll()).toHaveLength(1);
  });

  it("renames and removes files, in the order the vault lists them", async () => {
    const { db, kdbxEntry } = await dbWithAttachments();
    const pooled = kdbxEntry.binaries.get("pooled.bin");
    const store = new KdbxAttachmentStore();
    const vault = vaultFromKdbx(db, store);
    const attachments = onlyEntry(vault)
      .attachments.rename("pooled.bin", "renamed.bin")
      .remove("inline.bin");

    applyVaultToKdbx(db, vault.updateEntry(onlyEntry(vault).update({ attachments })), store);

    expect([...kdbxEntry.binaries.keys()]).toEqual(["renamed.bin", "secret.txt"]);
    expect(kdbxEntry.binaries.get("renamed.bin")).toBe(pooled);
  });

  it("puts a file back in the pool when it returns after being cleaned out", async () => {
    const { db, kdbxEntry } = await dbWithAttachments();
    const store = new KdbxAttachmentStore();
    const before = vaultFromKdbx(db, store);
    const { hash } = kdbxEntry.binaries.get("pooled.bin") as KdbxBinaryWithHash;
    const without = onlyEntry(before).attachments.remove("pooled.bin");
    applyVaultToKdbx(
      db,
      before.updateEntry(onlyEntry(before).update({ attachments: without })),
      store,
    );
    kdbxEntry.history = [];
    db.cleanup({ binaries: true });
    expect(db.binaries.getValueByHash(hash)).toBeUndefined();

    // A vault held since before the removal, e.g. one a save conflict kept.
    applyVaultToKdbx(db, before, store);

    expect(db.binaries.getValueByHash(hash)).toBeDefined();
    configureKdbxCrypto();
    const saved = await Kdbx.load(await db.save(), new Credentials(null));
    expect([...saved.getDefaultGroup().entries[0].binaries.keys()]).toEqual([
      "pooled.bin",
      "inline.bin",
      "secret.txt",
    ]);
  });

  it("refuses to write a file that was never prepared", () => {
    const db = createDb();
    const vault = vaultFromKdbx(db);
    const entry = Entry.create({
      attachments: new Attachments([new Attachment("a.bin", new Uint8Array([1]))]),
    });

    expect(() => applyVaultToKdbx(db, vault.addEntry(vault.rootGroup.id, entry))).toThrow(
      "An attachment was written before being prepared.",
    );
  });
});
