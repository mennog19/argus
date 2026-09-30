import { describe, expect, it } from "vitest";
import { CustomIcon, CustomIcons, Entry, Group, Icon, Vault } from "../../src/domain";

const LOGO = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000abcd", new Uint8Array([1]), "Logo");
const OTHER = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000ef01", new Uint8Array([2]));
const logo = Icon.custom(LOGO.id);

describe("Vault custom icons", () => {
  it("starts with none", () => {
    expect(Vault.create("Root").customIcons.size).toBe(0);
  });

  it("adds an icon", () => {
    const vault = Vault.create("Root").addCustomIcon(LOGO);
    expect(vault.customIcons.get(LOGO.id)).toBe(LOGO);
  });

  it("keeps its icons through tree edits, the recycle bin and purges", () => {
    const binned = Entry.create({ title: "Old" });
    const purged = Entry.create({ title: "Gone" });
    let vault = Vault.create("Root").addCustomIcon(LOGO);
    vault = vault.addEntry(vault.rootGroup.id, binned).addEntry(vault.rootGroup.id, purged);
    vault = vault.addGroup(vault.rootGroup.id, Group.create("Work"));
    vault = vault.deleteEntry(binned.id).emptyRecycleBin().purgeEntry(purged.id);
    expect(vault.customIcons.has(LOGO.id)).toBe(true);
  });

  it("keeps its icons when a group is deleted keeping its contents", () => {
    const work = Group.create("Work");
    const root = Group.create("Root").addGroup(work);
    const vault = new Vault("Root", root, undefined, [], new CustomIcons([LOGO]));
    expect(vault.deleteGroupKeepingContents(work.id).customIcons.has(LOGO.id)).toBe(true);
  });

  describe("removeCustomIcon", () => {
    it("switches every entry and group showing it back to automatic, however deep", () => {
      const shown = Entry.create({ title: "Bank", icon: logo });
      const untouched = Entry.create({ title: "Mail", icon: Icon.library("mail") });
      const nested = Group.create("Nested").changeIcon(logo).addEntry(shown);
      const plain = Group.create("Plain");
      const root = Group.create("Root").addGroup(nested).addGroup(plain).addEntry(untouched);
      const vault = new Vault("Root", root, undefined, [], new CustomIcons([LOGO, OTHER]));

      const after = vault.removeCustomIcon(LOGO.id);

      expect(after.customIcons.values).toEqual([OTHER]);
      expect(after.findGroup(nested.id)?.icon).toBe(Icon.AUTO);
      expect(after.findEntry(shown.id)?.icon).toBe(Icon.AUTO);
      expect(after.findEntry(untouched.id)?.icon.toString()).toBe("library:mail");
      expect(after.findGroup(plain.id)).toBe(plain);
    });

    it("leaves history revisions pointing at it", () => {
      const revision = Entry.create({ title: "Old", icon: logo });
      const entry = Entry.create({ title: "Bank", history: [revision] });
      const vault = new Vault(
        "Root",
        Group.create("Root").addEntry(entry),
        undefined,
        [],
        new CustomIcons([LOGO]),
      );
      expect(vault.removeCustomIcon(LOGO.id).findEntry(entry.id)?.history[0].icon).toBe(logo);
    });

    it("throws for an icon the vault doesn't hold", () => {
      expect(() => Vault.create("Root").removeCustomIcon(LOGO.id)).toThrow(
        `Custom icon not found: ${LOGO.id}`,
      );
    });
  });

  it("counts the entries and groups showing an icon", () => {
    const nested = Group.create("Nested")
      .changeIcon(logo)
      .addEntry(Entry.create({ title: "A", icon: logo }))
      .addEntry(Entry.create({ title: "B" }));
    const root = Group.create("Root")
      .addGroup(nested)
      .addEntry(Entry.create({ title: "C", icon: logo }));
    const vault = new Vault("Root", root, undefined, [], new CustomIcons([LOGO]));
    expect(vault.customIconUsage(LOGO.id)).toBe(3);
    expect(vault.customIconUsage(OTHER.id)).toBe(0);
  });

  describe("adoptCustomIcons", () => {
    it("copies in the icons its entries, revisions and groups use but it lacks", () => {
      const third = new CustomIcon("0a1b2c3d-0000-4000-8000-000000001234", new Uint8Array([3]));
      const revision = Entry.create({ title: "Old", icon: Icon.custom(OTHER.id) });
      const entry = Entry.create({ title: "Bank", icon: logo, history: [revision] });
      const group = Group.create("Work").changeIcon(Icon.custom(third.id));
      const vault = new Vault("Root", Group.create("Root").addEntry(entry).addGroup(group));

      const adopted = vault.adoptCustomIcons(new CustomIcons([LOGO, OTHER, third]));

      expect(adopted.customIcons.values).toEqual([LOGO, OTHER, third]);
    });

    it("keeps its own copy of an icon both vaults hold, and skips ones nothing uses", () => {
      const mine = new CustomIcon(LOGO.id, new Uint8Array([7]));
      const entry = Entry.create({ title: "Bank", icon: logo });
      const vault = new Vault(
        "Root",
        Group.create("Root").addEntry(entry),
        undefined,
        [],
        new CustomIcons([mine]),
      );

      expect(vault.adoptCustomIcons(new CustomIcons([LOGO, OTHER]))).toBe(vault);
    });

    it("skips an icon the source doesn't hold either", () => {
      const entry = Entry.create({ title: "Bank", icon: logo });
      const vault = new Vault("Root", Group.create("Root").addEntry(entry));
      expect(vault.adoptCustomIcons(CustomIcons.EMPTY)).toBe(vault);
    });
  });
});
