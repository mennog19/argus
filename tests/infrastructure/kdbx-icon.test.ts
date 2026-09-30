// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Consts, Credentials, Kdbx, KdbxEntry, KdbxUuid, ProtectedValue } from "kdbxweb";
import { CustomIcon, Entry, Icon } from "../../src/domain";
import {
  ICON_CUSTOM_DATA_KEY,
  LIBRARY_ICON_KEEPASS_IDS,
  iconFromKdbx,
  writeIconToKdbx,
} from "../../src/infrastructure/kdbx-icon";
import { configureKdbxCrypto } from "../../src/infrastructure/kdbx-crypto";
import { domainIdToKdbxUuid, kdbxUuidToDomainId } from "../../src/infrastructure/kdbx-id";
import { applyVaultToKdbx, vaultFromKdbx } from "../../src/infrastructure/kdbx-mapper";

const Icons = Consts.Icons;

function newEntry(): { db: Kdbx; entry: KdbxEntry } {
  const db = Kdbx.create(new Credentials(null), "Test");
  return { db, entry: db.createEntry(db.getDefaultGroup()) };
}

describe("iconFromKdbx", () => {
  it("reads KeePass's default Key icon as automatic", () => {
    expect(iconFromKdbx(newEntry().entry)).toBe(Icon.AUTO);
  });

  it("treats a missing icon id like the default", () => {
    const { entry } = newEntry();
    entry.icon = undefined;
    expect(iconFromKdbx(entry)).toBe(Icon.AUTO);
  });

  it("maps a KeePass standard icon to the first library icon listed for it", () => {
    const { entry } = newEntry();
    entry.icon = Icons.Package;
    expect(iconFromKdbx(entry).toString()).toBe("library:package");
  });

  it("reads a KeePass icon Argus has no library icon for as automatic", () => {
    const { entry } = newEntry();
    entry.icon = Icons.Tux;
    expect(iconFromKdbx(entry)).toBe(Icon.AUTO);
  });

  it("prefers Argus CustomData while it agrees with the KeePass icon", () => {
    const { entry } = newEntry();
    writeIconToKdbx(entry, Icon.library("luggage"));
    expect(iconFromKdbx(entry).toString()).toBe("library:luggage");

    writeIconToKdbx(entry, Icon.brand("github"));
    expect(iconFromKdbx(entry).toString()).toBe("brand:github");
  });

  it("follows another app's icon change over stale CustomData", () => {
    const { entry } = newEntry();
    writeIconToKdbx(entry, Icon.library("luggage"));
    entry.icon = Icons.Star;
    expect(iconFromKdbx(entry).toString()).toBe("library:star");

    writeIconToKdbx(entry, Icon.brand("github"));
    entry.icon = Icons.Key;
    expect(iconFromKdbx(entry)).toBe(Icon.AUTO);
  });

  it("ignores unparseable CustomData", () => {
    const { entry } = newEntry();
    entry.customData = new Map([[ICON_CUSTOM_DATA_KEY, { value: "nonsense" }]]);
    entry.icon = Icons.Home;
    expect(iconFromKdbx(entry).toString()).toBe("library:home");
  });

  it("reads a custom image icon over the standard one", () => {
    const { entry } = newEntry();
    entry.icon = Icons.Star;
    entry.customIcon = domainIdToKdbxUuid("0a1b2c3d-0000-4000-8000-00000000abcd");
    expect(iconFromKdbx(entry).toString()).toBe("custom:0a1b2c3d-0000-4000-8000-00000000abcd");
  });

  it("ignores an all-zero custom icon reference", () => {
    const { entry } = newEntry();
    entry.icon = Icons.Star;
    entry.customIcon = new KdbxUuid();
    expect(iconFromKdbx(entry).toString()).toBe("library:star");
  });
});

describe("writeIconToKdbx", () => {
  it("writes a library icon as its nearest KeePass icon plus CustomData", () => {
    const { entry } = newEntry();
    entry.customIcon = KdbxUuid.random();
    writeIconToKdbx(entry, Icon.library("star"));
    expect(entry.icon).toBe(Icons.Star);
    expect(entry.customIcon).toBeUndefined();
    expect(entry.customData?.get(ICON_CUSTOM_DATA_KEY)?.value).toBe("library:star");
  });

  it("writes a brand as the World icon", () => {
    const { entry } = newEntry();
    writeIconToKdbx(entry, Icon.brand("github"));
    expect(entry.icon).toBe(Icons.World);
  });

  it("falls back to the Key icon for a library key it doesn't know", () => {
    const { entry } = newEntry();
    writeIconToKdbx(entry, Icon.library("from-the-future"));
    expect(entry.icon).toBe(Icons.Key);
  });

  it("resets to the default and drops the CustomData for automatic", () => {
    const { entry } = newEntry();
    writeIconToKdbx(entry, Icon.library("star"));
    writeIconToKdbx(entry, Icon.AUTO);
    expect(entry.icon).toBe(Icons.Key);
    expect(entry.customData?.has(ICON_CUSTOM_DATA_KEY)).toBe(false);
  });

  it("writes a custom icon as the KDBX custom icon reference", () => {
    const { entry } = newEntry();
    writeIconToKdbx(entry, Icon.library("star"));
    writeIconToKdbx(entry, Icon.custom("0a1b2c3d-0000-4000-8000-00000000abcd"));
    expect(
      entry.customIcon?.equals(domainIdToKdbxUuid("0a1b2c3d-0000-4000-8000-00000000abcd")),
    ).toBe(true);
    expect(entry.icon).toBe(Icons.Key);
    expect(entry.customData?.has(ICON_CUSTOM_DATA_KEY)).toBe(false);
  });

  it("handles automatic on an entry without CustomData", () => {
    const { entry } = newEntry();
    entry.customData = undefined;
    writeIconToKdbx(entry, Icon.AUTO);
    expect(entry.icon).toBe(Icons.Key);
  });

  it("maps every library key to a real KeePass standard icon", () => {
    const standardIds = new Set<number>(Object.values(Icons));
    for (const id of Object.values(LIBRARY_ICON_KEEPASS_IDS)) {
      expect(standardIds.has(id)).toBe(true);
    }
  });
});

describe("icons through the mapper", () => {
  it("survives a save and reload", async () => {
    configureKdbxCrypto();
    const db = Kdbx.create(new Credentials(ProtectedValue.fromString("pw")), "Test");
    let vault = vaultFromKdbx(db);
    const entry = Entry.create({ title: "Trip", icon: Icon.library("luggage") });
    vault = vault.addEntry(vault.rootGroup.id, entry);
    applyVaultToKdbx(db, vault);

    const reloaded = await Kdbx.load(
      await db.save(),
      new Credentials(ProtectedValue.fromString("pw")),
    );
    const [mapped] = vaultFromKdbx(reloaded).rootGroup.entries;
    expect(mapped.icon.toString()).toBe("library:luggage");
  });

  it("survives a save and reload with a manual colour override", async () => {
    configureKdbxCrypto();
    const db = Kdbx.create(new Credentials(ProtectedValue.fromString("pw")), "Test");
    let vault = vaultFromKdbx(db);
    const entry = Entry.create({ title: "Trip", icon: Icon.library("luggage", 235) });
    vault = vault.addEntry(vault.rootGroup.id, entry);
    applyVaultToKdbx(db, vault);

    const reloaded = await Kdbx.load(
      await db.save(),
      new Credentials(ProtectedValue.fromString("pw")),
    );
    const [mapped] = vaultFromKdbx(reloaded).rootGroup.entries;
    expect(mapped.icon.toString()).toBe("library:luggage:235");
  });

  it("leaves an icon Argus can't show alone when other fields change", () => {
    const db = Kdbx.create(new Credentials(null), "Test");
    const kdbxEntry = db.createEntry(db.getDefaultGroup());
    kdbxEntry.icon = Icons.Tux;
    let vault = vaultFromKdbx(db);
    const [entry] = vault.rootGroup.entries;
    vault = vault.updateEntry(entry.update({ title: "Renamed" }));
    applyVaultToKdbx(db, vault);
    expect(kdbxEntry.icon).toBe(Icons.Tux);
    expect(kdbxEntry.fields.get("Title")).toBe("Renamed");
  });

  it("writes a changed icon choice", () => {
    const db = Kdbx.create(new Credentials(null), "Test");
    const kdbxEntry = db.createEntry(db.getDefaultGroup());
    let vault = vaultFromKdbx(db);
    const [entry] = vault.rootGroup.entries;
    vault = vault.updateEntry(entry.update({ icon: Icon.brand("github") }));
    applyVaultToKdbx(db, vault);
    expect(kdbxEntry.icon).toBe(Icons.World);
    expect(kdbxEntry.history).toHaveLength(1);
  });
});

describe("custom icons through the mapper", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

  function dbWithIcon(name?: string): { db: Kdbx; uuid: KdbxUuid } {
    const db = Kdbx.create(new Credentials(null), "Test");
    const uuid = KdbxUuid.random();
    db.meta.customIcons.set(uuid.id, { data: PNG.slice().buffer, name });
    return { db, uuid };
  }

  it("reads the vault's custom icons, with or without a name", () => {
    const { db, uuid } = dbWithIcon("Bank");
    const unnamed = KdbxUuid.random();
    db.meta.customIcons.set(unnamed.id, { data: new ArrayBuffer(1) });

    const [named, bare] = vaultFromKdbx(db).customIcons.values;

    expect(named.id).toBe(kdbxUuidToDomainId(uuid));
    expect(named.name).toBe("Bank");
    expect(Array.from(named.data)).toEqual(Array.from(PNG));
    expect(bare.name).toBe("");
  });

  it("shows an icon set in KeePass on the entry that uses it", () => {
    const { db, uuid } = dbWithIcon();
    db.createEntry(db.getDefaultGroup()).customIcon = uuid;

    const vault = vaultFromKdbx(db);
    const [entry] = vault.rootGroup.entries;

    expect(entry.icon.kind).toBe("custom");
    expect(vault.customIcons.has(entry.icon.key)).toBe(true);
  });

  it("saves an uploaded icon and the entry using it, and reads both back", async () => {
    configureKdbxCrypto();
    const credentials = () => new Credentials(ProtectedValue.fromString("pw"));
    const db = Kdbx.create(credentials(), "Test");
    const icon = CustomIcon.create(PNG, "Upload");
    let vault = vaultFromKdbx(db).addCustomIcon(icon);
    const unnamed = CustomIcon.create(PNG);
    vault = vault.addCustomIcon(unnamed);
    vault = vault.addEntry(
      vault.rootGroup.id,
      Entry.create({ title: "Bank", icon: Icon.custom(icon.id) }),
    );
    applyVaultToKdbx(db, vault);

    // Names are only written by KDBX 4.1; check them on the document itself.
    expect(db.meta.customIcons.get(domainIdToKdbxUuid(icon.id).id)?.name).toBe("Upload");
    expect(db.meta.customIcons.get(domainIdToKdbxUuid(unnamed.id).id)?.name).toBeUndefined();

    const reloaded = vaultFromKdbx(await Kdbx.load(await db.save(), credentials()));

    expect(reloaded.rootGroup.entries[0].icon.toString()).toBe(`custom:${icon.id}`);
    expect(Array.from(reloaded.customIcons.get(icon.id)!.data)).toEqual(Array.from(PNG));
  });

  it("leaves an existing icon alone when other things change", () => {
    const { db, uuid } = dbWithIcon("Bank");
    const lastModified = new Date("2024-01-01T00:00:00Z");
    db.meta.customIcons.get(uuid.id)!.lastModified = lastModified;
    const kdbxEntry = db.createEntry(db.getDefaultGroup());
    kdbxEntry.customIcon = uuid;
    let vault = vaultFromKdbx(db);
    vault = vault.updateEntry(vault.rootGroup.entries[0].update({ title: "Renamed" }));

    applyVaultToKdbx(db, vault);

    expect(db.meta.customIcons.get(uuid.id)?.lastModified).toBe(lastModified);
    expect(kdbxEntry.customIcon).toBe(uuid);
    expect(db.deletedObjects).toHaveLength(0);
  });

  it("deletes an icon along with every reference to it, history included", () => {
    const { db, uuid } = dbWithIcon();
    const kept = KdbxUuid.random();
    db.meta.customIcons.set(kept.id, { data: new ArrayBuffer(1) });
    const group = db.createGroup(db.getDefaultGroup(), "Work");
    group.customIcon = uuid;
    const entry = db.createEntry(group);
    entry.customIcon = uuid;
    entry.pushHistory();
    const other = db.createEntry(group);
    other.customIcon = kept;

    const vault = vaultFromKdbx(db).removeCustomIcon(kdbxUuidToDomainId(uuid));
    applyVaultToKdbx(db, vault);

    expect(db.meta.customIcons.has(uuid.id)).toBe(false);
    expect(db.meta.customIcons.has(kept.id)).toBe(true);
    expect(group.customIcon).toBeUndefined();
    expect(entry.customIcon).toBeUndefined();
    expect(entry.history.every((revision) => revision.customIcon === undefined)).toBe(true);
    expect(other.customIcon).toBe(kept);
    expect(db.deletedObjects.map((deleted) => deleted.uuid?.id)).toContain(uuid.id);
  });
});
