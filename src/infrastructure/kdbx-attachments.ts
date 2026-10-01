import { Kdbx, KdbxBinary, KdbxBinaryWithHash, KdbxEntry, ProtectedValue } from "kdbxweb";
import { Attachment, Attachments, Group, Vault } from "../domain";

type EntryBinary = KdbxBinary | KdbxBinaryWithHash;

function* entriesOf(group: Group): Generator<Attachments> {
  for (const entry of group.entries) {
    yield entry.attachments;
  }
  for (const child of group.groups) {
    yield* entriesOf(child);
  }
}

/**
 * Pairs the bytes an `Attachment` carries with the binary the open document
 * holds for them, in both directions, for as long as the document is open.
 *
 * Mapping the same binary always hands out the same `Uint8Array`, so every
 * revision that shares a file shares its bytes too, a protected binary is
 * decrypted once rather than on every save, and comparing attachments that
 * didn't change is an identity check. Going the other way, an attachment that
 * came from the document is written back as the binary it came from, keeping
 * its protection flag exactly as KeePass set it.
 */
export class KdbxAttachmentStore {
  private readonly dataByValue = new WeakMap<KdbxBinary, Uint8Array>();
  private readonly binaryByData = new WeakMap<Uint8Array, EntryBinary>();

  attachmentsOf(kdbxEntry: KdbxEntry): Attachments {
    return new Attachments(
      Array.from(kdbxEntry.binaries, ([name, binary]) => new Attachment(name, this.dataOf(binary))),
    );
  }

  /**
   * Puts the files `vault` holds that the document doesn't know yet — added
   * in Argus, or merged in from another vault — into the document's binary
   * pool. Hashing them is asynchronous, which is why this is a step of its
   * own that has to run before `write`.
   */
  async prepare(db: Kdbx, vault: Vault): Promise<void> {
    for (const attachments of entriesOf(vault.rootGroup)) {
      for (const { data } of attachments.values) {
        if (!this.binaryByData.has(data)) {
          // A copy, so the document's bytes can't be changed through the vault's.
          const binary = await db.createBinary(data.slice().buffer);
          this.dataByValue.set(binary.value, data);
          this.binaryByData.set(data, binary);
        }
      }
    }
  }

  /**
   * Brings the entry's binaries in line with `attachments`. Only touched when
   * the set actually changed, so a file Argus merely carried along stays the
   * very object kdbxweb parsed.
   */
  write(db: Kdbx, kdbxEntry: KdbxEntry, attachments: Attachments): void {
    if (this.attachmentsOf(kdbxEntry).equals(attachments)) {
      return;
    }
    kdbxEntry.binaries = new Map(
      attachments.values.map(({ name, data }) => [name, this.binaryFor(db, data)]),
    );
  }

  private dataOf(binary: EntryBinary): Uint8Array {
    const value = "hash" in binary ? binary.value : binary;
    let data = this.dataByValue.get(value);
    if (!data) {
      data = value instanceof ProtectedValue ? value.getBinary() : new Uint8Array(value);
      this.dataByValue.set(value, data);
      this.binaryByData.set(data, binary);
    }
    return data;
  }

  private binaryFor(db: Kdbx, data: Uint8Array): EntryBinary {
    const binary = this.binaryByData.get(data);
    if (!binary) {
      throw new Error("An attachment was written before being prepared.");
    }
    // The pool drops a binary once nothing refers to it. kdbxweb silently
    // leaves out an entry's binaries when one isn't pooled, so a file that
    // comes back — restored from a vault held since before its removal — is
    // pooled again first.
    if ("hash" in binary && !db.binaries.getValueByHash(binary.hash)) {
      db.binaries.addWithHash(binary);
    }
    return binary;
  }
}
