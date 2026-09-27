// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Consts, Credentials, Kdbx, KdbxEntry, KdbxUuid, ProtectedValue } from "kdbxweb";
import { Entry, Icon } from "../../src/domain";
import {
  ICON_CUSTOM_DATA_KEY,
  LIBRARY_ICON_KEEPASS_IDS,
  iconFromKdbx,
  writeIconToKdbx,
} from "../../src/infrastructure/kdbx-icon";
import { configureKdbxCrypto } from "../../src/infrastructure/kdbx-crypto";
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

  it("reads an entry with a custom image icon as automatic", () => {
    const { entry } = newEntry();
    entry.icon = Icons.Star;
    entry.customIcon = KdbxUuid.random();
    expect(iconFromKdbx(entry)).toBe(Icon.AUTO);
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
