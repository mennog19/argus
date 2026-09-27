import { describe, expect, it } from "vitest";
import { CustomField } from "../../src/domain/custom-field";
import { CustomFields } from "../../src/domain/custom-fields";
import { Entry } from "../../src/domain/entry";
import { Group } from "../../src/domain/group";
import { Password } from "../../src/domain/password";
import { Tag } from "../../src/domain/tag";
import { Tags } from "../../src/domain/tags";
import { Vault } from "../../src/domain/vault";
import { diffVaults, mergeFieldValue } from "../../src/domain/vault-merge";

const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

function vaultWithEntries(name: string, entries: readonly Entry[]): Vault {
  let root = Group.create(name);
  for (const entry of entries) {
    root = root.addEntry(entry);
  }
  return new Vault(name, root);
}

function totpFields(secret: string): CustomFields {
  return new CustomFields([new CustomField("otp", `otpauth://totp/Bank?secret=${secret}`)]);
}

describe("mergeFieldValue", () => {
  it("reads each plain field straight off the entry", () => {
    const entry = Entry.create({
      title: "Bank",
      username: "alice",
      password: new Password("secret"),
      url: "https://bank.example",
    });

    expect(mergeFieldValue(entry, "title")).toBe("Bank");
    expect(mergeFieldValue(entry, "username")).toBe("alice");
    expect(mergeFieldValue(entry, "password")).toBe("secret");
    expect(mergeFieldValue(entry, "url")).toBe("https://bank.example");
  });

  it("folds a TOTP configuration into one canonical string", () => {
    const entry = Entry.create({ title: "Bank", customFields: totpFields(TOTP_SECRET) });

    expect(mergeFieldValue(entry, "totp")).toBe(`${TOTP_SECRET}:SHA1:6:30`);
  });

  it("reads an entry with no authenticator as an empty TOTP value", () => {
    expect(mergeFieldValue(Entry.create({ title: "Bank" }), "totp")).toBe("");
  });
});

describe("diffVaults", () => {
  it("treats an entry sharing no field with anything as new", () => {
    const target = vaultWithEntries("Target", [Entry.create({ title: "Bank", username: "alice" })]);
    const source = vaultWithEntries("Source", [Entry.create({ title: "Forum", username: "bob" })]);

    const plan = diffVaults(target, source);

    expect(plan.newEntries).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
    expect(plan.identical).toEqual([]);
  });

  it("matches on title + username, case-insensitively and ignoring whitespace", () => {
    const targetEntry = Entry.create({ title: "  Bank  ", username: "Alice" });
    const target = vaultWithEntries("Target", [targetEntry]);
    const source = vaultWithEntries("Source", [Entry.create({ title: "bank", username: "alice" })]);

    const plan = diffVaults(target, source);

    // The match itself is case/whitespace-insensitive, but the raw values still
    // differ, so this is a matched pair with differences, not an identical one.
    expect(plan.newEntries).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].targetEntry.equals(targetEntry)).toBe(true);
  });

  it("matches on url + username when the titles differ", () => {
    const target = vaultWithEntries("Target", [
      Entry.create({ title: "Old Name", username: "alice", url: "https://example.com" }),
    ]);
    const source = vaultWithEntries("Source", [
      Entry.create({ title: "New Name", username: "alice", url: "https://example.com" }),
    ]);

    expect(diffVaults(target, source).conflicts).toHaveLength(1);
  });

  it("matches two entries on the same site that both have no username", () => {
    const target = vaultWithEntries("Target", [
      Entry.create({ title: "Home Wi-Fi", password: new Password("old-key") }),
    ]);
    const source = vaultWithEntries("Source", [
      Entry.create({ title: "Home Wi-Fi", password: new Password("new-key") }),
    ]);

    expect(diffVaults(target, source).conflicts).toHaveLength(1);
  });

  it("keeps two accounts on the same site separate", () => {
    const target = vaultWithEntries("Target", [Entry.create({ title: "GitHub", username: "me" })]);
    const source = vaultWithEntries("Source", [
      Entry.create({ title: "GitHub", username: "work" }),
    ]);

    expect(diffVaults(target, source).newEntries).toHaveLength(1);
  });

  it("does not match a filled username against a blank one on the same site", () => {
    const target = vaultWithEntries("Target", [Entry.create({ title: "GitHub" })]);
    const source = vaultWithEntries("Source", [Entry.create({ title: "GitHub", username: "me" })]);

    expect(diffVaults(target, source).newEntries).toHaveLength(1);
  });

  it("does not match unrelated sites that only share a username", () => {
    // The real-world case this rule exists for: one reused username must not
    // pair an Airbnb login with a Netflix login.
    const target = vaultWithEntries("Target", [
      Entry.create({ title: "Airbnb", username: "menno", password: new Password("test111") }),
    ]);
    const source = vaultWithEntries("Source", [
      Entry.create({
        title: "Netflix",
        username: "menno",
        password: new Password("test123"),
        url: "netflix.com",
      }),
    ]);

    const plan = diffVaults(target, source);

    expect(plan.newEntries).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
  });

  it("does not match unrelated sites that only share a reused password", () => {
    const target = vaultWithEntries("Target", [
      Entry.create({ title: "Airbnb", username: "menno", password: new Password("reused") }),
    ]);
    const source = vaultWithEntries("Source", [
      Entry.create({ title: "Netflix", username: "other", password: new Password("reused") }),
    ]);

    expect(diffVaults(target, source).newEntries).toHaveLength(1);
  });

  it("does not match unrelated sites that only share an authenticator", () => {
    const target = vaultWithEntries("Target", [
      Entry.create({ title: "Airbnb", username: "menno", customFields: totpFields(TOTP_SECRET) }),
    ]);
    const source = vaultWithEntries("Source", [
      Entry.create({ title: "Netflix", username: "other", customFields: totpFields(TOTP_SECRET) }),
    ]);

    expect(diffVaults(target, source).newEntries).toHaveLength(1);
  });

  it("does not treat two blank fields as a shared field", () => {
    const target = vaultWithEntries("Target", [Entry.create({ title: "Bank" })]);
    const source = vaultWithEntries("Source", [Entry.create({ title: "Forum" })]);

    // Both have blank username, password, url and totp; none of that counts.
    expect(diffVaults(target, source).newEntries).toHaveLength(1);
  });

  it("reports no differences for a pair that matches on every compared field", () => {
    const shared = {
      title: "Bank",
      username: "alice",
      password: new Password("secret"),
      url: "https://bank.example",
      customFields: totpFields(TOTP_SECRET),
    };
    const target = vaultWithEntries("Target", [Entry.create(shared)]);
    const source = vaultWithEntries("Source", [Entry.create(shared)]);

    const plan = diffVaults(target, source);

    expect(plan.identical).toHaveLength(1);
    expect(plan.identical[0].differences).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it("ignores notes, tags and non-TOTP custom fields entirely", () => {
    const target = vaultWithEntries("Target", [
      Entry.create({
        title: "Bank",
        username: "alice",
        notes: "old note",
        tags: new Tags([new Tag("finance")]),
        customFields: new CustomFields([new CustomField("PIN", "1111")]),
      }),
    ]);
    const source = vaultWithEntries("Source", [
      Entry.create({
        title: "Bank",
        username: "alice",
        notes: "new note",
        tags: new Tags([new Tag("work")]),
        customFields: new CustomFields([new CustomField("PIN", "2222")]),
      }),
    ]);

    const plan = diffVaults(target, source);

    expect(plan.conflicts).toEqual([]);
    expect(plan.identical).toHaveLength(1);
  });

  it("reports a difference per compared field that doesn't match", () => {
    const target = vaultWithEntries("Target", [
      Entry.create({
        title: "Bank",
        username: "alice",
        password: new Password("old-secret"),
        url: "https://bank.example",
        customFields: totpFields(TOTP_SECRET),
      }),
    ]);
    const source = vaultWithEntries("Source", [
      Entry.create({
        title: "Bank",
        username: "alice",
        password: new Password("new-secret"),
        url: "https://bank.example/login",
      }),
    ]);

    const plan = diffVaults(target, source);

    expect(plan.conflicts).toHaveLength(1);
    const fields = plan.conflicts[0].differences.map((difference) => difference.field).sort();
    expect(fields).toEqual(["password", "totp", "url"]);
    expect(plan.conflicts[0].differences.find((d) => d.field === "password")).toEqual({
      field: "password",
      targetValue: "old-secret",
      sourceValue: "new-secret",
    });
  });

  it("pairs a source entry with the target entry it shares the most fields with", () => {
    // Both candidates match on title + username; the first also shares a URL,
    // so it stays the winner even though the looser one is checked afterwards.
    const closest = Entry.create({
      title: "Bank",
      username: "alice",
      url: "https://bank.example",
    });
    const looser = Entry.create({ title: "Bank", username: "alice" });
    const target = vaultWithEntries("Target", [closest, looser]);
    const source = vaultWithEntries("Source", [
      Entry.create({
        title: "Bank",
        username: "alice",
        url: "https://bank.example",
        password: new Password("added"),
      }),
    ]);

    const plan = diffVaults(target, source);

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].targetEntry.equals(closest)).toBe(true);
  });

  it("upgrades to a closer match found later in the vault", () => {
    const looser = Entry.create({ title: "Bank", username: "alice" });
    const closest = Entry.create({
      title: "Bank",
      username: "alice",
      url: "https://bank.example",
    });
    const target = vaultWithEntries("Target", [looser, closest]);
    const source = vaultWithEntries("Source", [
      Entry.create({
        title: "Bank",
        username: "alice",
        url: "https://bank.example",
        password: new Password("added"),
      }),
    ]);

    const plan = diffVaults(target, source);

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].targetEntry.equals(closest)).toBe(true);
  });

  it("claims each target entry at most once, in source order", () => {
    const targetEntry = Entry.create({ title: "Bank", username: "alice" });
    const target = vaultWithEntries("Target", [targetEntry]);
    const firstSource = Entry.create({ title: "Bank", username: "alice", notes: "first" });
    const secondSource = Entry.create({ title: "Bank", username: "alice", notes: "second" });
    const source = vaultWithEntries("Source", [firstSource, secondSource]);

    const plan = diffVaults(target, source);

    // The first source entry consumes the only target entry; notes are ignored,
    // so that pair is identical and the second source entry is left over.
    expect(plan.identical).toHaveLength(1);
    expect(plan.identical[0].sourceEntry.equals(firstSource)).toBe(true);
    expect(plan.newEntries).toHaveLength(1);
    expect(plan.newEntries[0].equals(secondSource)).toBe(true);
  });

  it("recurses into nested groups on both sides", () => {
    const nestedTargetEntry = Entry.create({ title: "Nested", username: "alice" });
    const target = new Vault(
      "Target",
      Group.create("Target").addGroup(Group.create("Sub").addEntry(nestedTargetEntry)),
    );
    const nestedSourceEntry = Entry.create({
      title: "nested",
      username: "alice",
    });
    const source = new Vault(
      "Source",
      Group.create("Source").addGroup(Group.create("Sub").addEntry(nestedSourceEntry)),
    );

    const plan = diffVaults(target, source);

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].targetEntry.equals(nestedTargetEntry)).toBe(true);
  });

  it("ignores entries inside either vault's recycle bin", () => {
    const recycledEntry = Entry.create({ title: "Old", username: "alice" });
    const bin = Group.create("Recycle Bin").addEntry(recycledEntry);
    let targetRoot = Group.create("Target");
    targetRoot = targetRoot.addGroup(bin);
    const target = new Vault("Target", targetRoot, bin.id);

    const source = vaultWithEntries("Source", [Entry.create({ title: "Old", username: "alice" })]);

    const plan = diffVaults(target, source);

    expect(plan.newEntries).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
  });
});
