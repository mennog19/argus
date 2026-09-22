// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Consts, Credentials, Kdbx, KdbxUuid, ProtectedValue } from "kdbxweb";
import {
  CustomField,
  CustomFields,
  Entry,
  Group,
  Icon,
  Password,
  Tag,
  Tags,
  Vault,
} from "../domain";

const Icons = Consts.Icons;
import { domainIdToKdbxUuid, kdbxUuidToDomainId } from "./kdbx-id";
import { applyVaultToKdbx, vaultFromKdbx } from "./kdbx-mapper";

function createDb(name = "Test Vault"): Kdbx {
  return Kdbx.create(new Credentials(null), name);
}

describe("vaultFromKdbx", () => {
  it("maps the database name and root group name", () => {
    const db = createDb("My Vault");
    const vault = vaultFromKdbx(db);
    expect(vault.name).toBe("My Vault");
    expect(vault.rootGroup.name).toBe("My Vault");
  });

  it("falls back to an empty string when the database or group has no name", () => {
    const db = createDb();
    db.meta.name = undefined;
    db.getDefaultGroup().name = undefined;
    const vault = vaultFromKdbx(db);
    expect(vault.name).toBe("");
    expect(vault.rootGroup.name).toBe("");
  });

  it("maps standard fields, tags, and custom fields for an entry", () => {
    const db = createDb();
    const root = db.getDefaultGroup();
    const entry = db.createEntry(root);
    entry.fields.set("Title", "GitHub");
    entry.fields.set("UserName", "octocat");
    entry.fields.set("Password", ProtectedValue.fromString("s3cret"));
    entry.fields.set("URL", "https://github.com");
    entry.fields.set("Notes", "personal account");
    entry.fields.set("TOTP Seed", ProtectedValue.fromString("JBSWY3DPEHPK3PXP"));
    entry.fields.set("Recovery Codes", "abc-123");
    entry.tags = ["work", "important"];

    const vault = vaultFromKdbx(db);
    const [mapped] = vault.rootGroup.entries;

    expect(mapped.title).toBe("GitHub");
    expect(mapped.username).toBe("octocat");
    expect(mapped.password.reveal()).toBe("s3cret");
    expect(mapped.url).toBe("https://github.com");
    expect(mapped.notes).toBe("personal account");
    expect(mapped.tags.values.map((t) => t.toString()).sort()).toEqual(["important", "work"]);
    expect(mapped.customFields.get("TOTP Seed")).toEqual(
      new CustomField("TOTP Seed", "JBSWY3DPEHPK3PXP", true),
    );
    expect(mapped.customFields.get("Recovery Codes")).toEqual(
      new CustomField("Recovery Codes", "abc-123", false),
    );
    expect(mapped.id.toString()).toBe(kdbxUuidToDomainId(entry.uuid));
  });

  it("treats a missing standard field as an empty string", () => {
    const db = createDb();
    const entry = db.createEntry(db.getDefaultGroup());
    entry.fields.delete("Notes");

    const vault = vaultFromKdbx(db);
    expect(vault.rootGroup.entries[0].notes).toBe("");
  });

  it("maps the recycle bin group's id from meta.recycleBinUuid", () => {
    const db = createDb();

    const vault = vaultFromKdbx(db);

    expect(vault.recycleBinId).toBeDefined();
    expect(vault.recycleBin?.name).toBe("Recycle Bin");
  });

  it("leaves recycleBinId undefined when the recycle bin is disabled", () => {
    const db = createDb();
    db.meta.recycleBinEnabled = false;

    const vault = vaultFromKdbx(db);

    expect(vault.recycleBinId).toBeUndefined();
  });

  it("leaves recycleBinId undefined when recycleBinUuid points at a group that no longer exists", () => {
    const db = createDb();
    db.meta.recycleBinEnabled = true;
    db.meta.recycleBinUuid = new KdbxUuid(new ArrayBuffer(16));

    const vault = vaultFromKdbx(db);

    expect(vault.recycleBinId).toBeUndefined();
  });

  it("maps nested groups", () => {
    const db = createDb();
    const root = db.getDefaultGroup();
    const child = db.createGroup(root, "Work");
    const grandchild = db.createGroup(child, "Servers");
    db.createEntry(grandchild).fields.set("Title", "prod-db");

    const vault = vaultFromKdbx(db);
    const work = vault.rootGroup.groups.find((g) => g.name === "Work");
    expect(work).toBeDefined();
    const servers = work?.groups.find((g) => g.name === "Servers");
    expect(servers).toBeDefined();
    expect(servers?.entries[0].title).toBe("prod-db");
  });

  it("maps a group's chosen icon", () => {
    const db = createDb();
    const child = db.createGroup(db.getDefaultGroup(), "Work");
    child.customData ??= new Map();
    child.customData.set("Argus.Icon", { value: "library:briefcase" });
    child.icon = Icons.Package; // the KeePass id LIBRARY_ICON_KEEPASS_IDS maps "briefcase" to

    const vault = vaultFromKdbx(db);
    const work = vault.rootGroup.groups.find((g) => g.name === "Work")!;

    expect(work.icon.equals(Icon.library("briefcase"))).toBe(true);
  });
});

describe("applyVaultToKdbx", () => {
  it("syncs a changed vault name onto the database", () => {
    const db = createDb("Old Name");
    const vault = vaultFromKdbx(db);
    const renamed = new Vault("New Name", vault.rootGroup);

    applyVaultToKdbx(db, renamed);
    expect(db.meta.name).toBe("New Name");
  });

  it("leaves the database name alone when it didn't change", () => {
    const db = createDb("Same Name");
    const vault = vaultFromKdbx(db);
    const before = db.meta.name;

    applyVaultToKdbx(db, vault);
    expect(db.meta.name).toBe(before);
  });

  it("creates a new entry added to the domain vault, honoring memory-protection settings", () => {
    const db = createDb();
    db.meta.memoryProtection.title = true;
    db.meta.memoryProtection.userName = true;
    db.meta.memoryProtection.url = true;
    db.meta.memoryProtection.notes = true;
    let vault = vaultFromKdbx(db);
    const entry = Entry.create({
      title: "New Site",
      username: "me",
      password: new Password("hunter2"),
      url: "https://example.com",
      notes: "note",
      tags: new Tags([new Tag("new")]),
      customFields: new CustomFields([new CustomField("PIN", "1234", true)]),
    });
    vault = vault.addEntry(vault.rootGroup.id, entry);

    applyVaultToKdbx(db, vault);

    const [kdbxEntry] = db.getDefaultGroup().entries;
    expect(kdbxEntry.fields.get("Title")).toBeInstanceOf(ProtectedValue);
    expect((kdbxEntry.fields.get("Title") as ProtectedValue).getText()).toBe("New Site");
    expect(kdbxEntry.fields.get("UserName")).toBeInstanceOf(ProtectedValue);
    expect(kdbxEntry.fields.get("URL")).toBeInstanceOf(ProtectedValue);
    expect(kdbxEntry.fields.get("Notes")).toBeInstanceOf(ProtectedValue);
    expect(kdbxEntry.fields.get("Password")).toBeInstanceOf(ProtectedValue);
    expect(kdbxEntry.fields.get("PIN")).toBeInstanceOf(ProtectedValue);
    expect(kdbxEntry.tags).toEqual(["new"]);

    const reMapped = vaultFromKdbx(db);
    expect(reMapped.rootGroup.entries[0].id.toString()).toBe(entry.id.toString());
  });

  it("creates a new nested group added to the domain vault", () => {
    const db = createDb();
    let vault = vaultFromKdbx(db);
    const newGroup = Group.create("Personal");
    vault = vault.addGroup(vault.rootGroup.id, newGroup);

    applyVaultToKdbx(db, vault);

    const kdbxChild = db.getDefaultGroup().groups.find((g) => g.name === "Personal");
    expect(kdbxChild).toBeDefined();
    expect(kdbxUuidToDomainId(kdbxChild!.uuid)).toBe(newGroup.id.toString());
  });

  it("updates a changed entry, pushing history, and leaves an unchanged entry's history alone", () => {
    const db = createDb();
    const entry = db.createEntry(db.getDefaultGroup());
    entry.fields.set("Title", "Original");
    entry.fields.set("UserName", "");
    entry.fields.set("Password", ProtectedValue.fromString(""));
    entry.fields.set("URL", "");
    entry.fields.set("Notes", "");
    entry.tags = ["keep"];
    entry.icon = 5; // fidelity check: untouched fields must survive a no-op save

    const vault = vaultFromKdbx(db);
    const [domainEntry] = vault.rootGroup.entries;

    // No-op save: nothing changed, so no history should be pushed.
    applyVaultToKdbx(db, vault);
    expect(db.getDefaultGroup().entries[0].history).toHaveLength(0);
    expect(db.getDefaultGroup().entries[0].icon).toBe(5);

    // Real change: history should grow by one.
    const updated = domainEntry.update({ title: "Changed" });
    const changedVault = vault.updateEntry(updated);
    applyVaultToKdbx(db, changedVault);

    const savedEntry = db.getDefaultGroup().entries[0];
    expect(savedEntry.history).toHaveLength(1);
    expect(savedEntry.history[0].fields.get("Title")).toBe("Original");
    expect(savedEntry.fields.get("Title")).toBe("Changed");
    expect(savedEntry.icon).toBe(5);
    expect(savedEntry.tags).toEqual(["keep"]);
  });

  it("moves a removed top-level entry into the recycle bin", () => {
    const db = createDb();
    const entry = db.createEntry(db.getDefaultGroup());
    entry.fields.set("Title", "orphaned");

    const vault = vaultFromKdbx(db);
    const updatedVault = vault.removeEntry(vault.rootGroup.entries[0].id);

    applyVaultToKdbx(db, updatedVault);

    const recycleBin = db.getDefaultGroup().groups.find((g) => g.name === "Recycle Bin")!;
    expect(recycleBin.entries[0].fields.get("Title")).toBe("orphaned");
    expect(db.getDefaultGroup().entries).toHaveLength(0);
  });

  it("removes a custom field that was deleted on the domain entry", () => {
    const db = createDb();
    const entry = db.createEntry(db.getDefaultGroup());
    entry.fields.set("Keep", "a");
    entry.fields.set("Drop", "b");

    const vault = vaultFromKdbx(db);
    const [domainEntry] = vault.rootGroup.entries;
    const updated = domainEntry.update({ customFields: domainEntry.customFields.remove("Drop") });
    const updatedVault = vault.updateEntry(updated);

    applyVaultToKdbx(db, updatedVault);

    const kdbxEntry = db.getDefaultGroup().entries[0];
    expect(kdbxEntry.fields.has("Drop")).toBe(false);
    expect(kdbxEntry.fields.get("Keep")).toBe("a");
  });

  it("moves an entry to a different existing group", () => {
    const db = createDb();
    const root = db.getDefaultGroup();
    const groupA = db.createGroup(root, "A");
    db.createGroup(root, "B");
    db.createEntry(groupA).fields.set("Title", "movable");

    const vault = vaultFromKdbx(db);
    const a = vault.rootGroup.groups.find((g) => g.name === "A")!;
    const b = vault.rootGroup.groups.find((g) => g.name === "B")!;
    const entry = a.entries[0];

    let updatedVault = vault.removeEntry(entry.id);
    updatedVault = updatedVault.addEntry(b.id, entry);

    applyVaultToKdbx(db, updatedVault);

    const kdbxA = db.getDefaultGroup().groups.find((g) => g.name === "A")!;
    const kdbxB = db.getDefaultGroup().groups.find((g) => g.name === "B")!;
    expect(kdbxA.entries).toHaveLength(0);
    expect(kdbxB.entries).toHaveLength(1);
    expect(kdbxUuidToDomainId(kdbxB.entries[0].uuid)).toBe(entry.id.toString());
  });

  it("moves a group to a different existing parent", () => {
    const db = createDb();
    const root = db.getDefaultGroup();
    const groupA = db.createGroup(root, "A");
    db.createGroup(root, "B");
    db.createGroup(groupA, "Movable");

    const vault = vaultFromKdbx(db);
    const a = vault.rootGroup.groups.find((g) => g.name === "A")!;
    const b = vault.rootGroup.groups.find((g) => g.name === "B")!;
    const movable = a.groups.find((g) => g.name === "Movable")!;

    let updatedVault = vault.removeGroup(movable.id);
    updatedVault = updatedVault.addGroup(b.id, movable);

    applyVaultToKdbx(db, updatedVault);

    const kdbxA = db.getDefaultGroup().groups.find((g) => g.name === "A")!;
    const kdbxB = db.getDefaultGroup().groups.find((g) => g.name === "B")!;
    expect(kdbxA.groups).toHaveLength(0);
    expect(kdbxB.groups.some((g) => g.name === "Movable")).toBe(true);
  });

  it("moves a removed entry/group into the recycle bin without flattening a removed subtree", () => {
    const db = createDb();
    const root = db.getDefaultGroup();
    const parent = db.createGroup(root, "Parent");
    const child = db.createGroup(parent, "Child");
    db.createEntry(child).fields.set("Title", "nested");
    db.createEntry(parent).fields.set("Title", "direct");

    const vault = vaultFromKdbx(db);
    const parentDomain = vault.rootGroup.groups.find((g) => g.name === "Parent")!;
    const updatedVault = vault.removeGroup(parentDomain.id);

    applyVaultToKdbx(db, updatedVault);

    const recycleBin = db.getDefaultGroup().groups.find((g) => g.name === "Recycle Bin")!;
    const recycledParent = recycleBin.groups.find((g) => g.name === "Parent")!;
    expect(recycledParent).toBeDefined();
    const recycledChild = recycledParent.groups.find((g) => g.name === "Child");
    expect(recycledChild).toBeDefined();
    expect(recycledChild?.entries[0].fields.get("Title")).toBe("nested");
    expect(recycledParent.entries[0].fields.get("Title")).toBe("direct");
  });

  it("writes a lazily-created domain recycle bin's id onto meta.recycleBinUuid", () => {
    const db = createDb();
    db.meta.recycleBinEnabled = false;
    const entry = db.createEntry(db.getDefaultGroup());
    entry.fields.set("Title", "to delete");

    let vault = vaultFromKdbx(db);
    expect(vault.recycleBinId).toBeUndefined();
    vault = vault.deleteEntry(vault.rootGroup.entries[0].id);

    applyVaultToKdbx(db, vault);

    expect(db.meta.recycleBinEnabled).toBe(true);
    expect(db.meta.recycleBinUuid?.equals(domainIdToKdbxUuid(vault.recycleBinId!.toString()))).toBe(
      true,
    );

    const reopened = vaultFromKdbx(db);
    expect(reopened.recycleBinId?.equals(vault.recycleBinId!)).toBe(true);
  });

  it("renames an existing group that changed", () => {
    const db = createDb();
    const kdbxGroup = db.createGroup(db.getDefaultGroup(), "Old");
    const vault = vaultFromKdbx(db);
    const group = vault.rootGroup.groups.find((g) => g.name === "Old")!;
    const renamed = group.rename("New");
    const updatedVault = vault.removeGroup(group.id).addGroup(vault.rootGroup.id, renamed);

    applyVaultToKdbx(db, updatedVault);
    expect(kdbxGroup.name).toBe("New");
  });

  it("writes a changed group icon", () => {
    const db = createDb();
    const kdbxGroup = db.createGroup(db.getDefaultGroup(), "Work");
    const vault = vaultFromKdbx(db);
    const group = vault.rootGroup.groups.find((g) => g.name === "Work")!;
    const recolored = group.changeIcon(Icon.library("briefcase"));
    const updatedVault = vault.removeGroup(group.id).addGroup(vault.rootGroup.id, recolored);

    applyVaultToKdbx(db, updatedVault);

    expect(kdbxGroup.icon).toBe(Icons.Package);
    expect(kdbxGroup.customData?.get("Argus.Icon")?.value).toBe("library:briefcase");
  });

  it("leaves an unchanged group's icon untouched", () => {
    const db = createDb();
    const kdbxGroup = db.createGroup(db.getDefaultGroup(), "Work");
    kdbxGroup.icon = 5; // fidelity check: an icon Argus can't represent must survive a no-op save
    const vault = vaultFromKdbx(db);

    applyVaultToKdbx(db, vault);

    expect(kdbxGroup.icon).toBe(5);
  });

  it("respects memory-protection settings that are off for a field", () => {
    const db = createDb();
    db.meta.memoryProtection.title = false;
    db.meta.memoryProtection.userName = false;
    db.meta.memoryProtection.url = false;
    db.meta.memoryProtection.notes = false;
    let vault = vaultFromKdbx(db);
    const entry = Entry.create({ title: "plain" });
    vault = vault.addEntry(vault.rootGroup.id, entry);

    applyVaultToKdbx(db, vault);

    const kdbxEntry = db.getDefaultGroup().entries[0];
    expect(kdbxEntry.fields.get("Title")).toBe("plain");
  });
});
