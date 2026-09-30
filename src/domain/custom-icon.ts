/**
 * An image icon stored inside the vault itself (KDBX `Meta/CustomIcons`),
 * either uploaded in Argus or set in KeePass/KeePassXC. Entries and groups
 * refer to it by `id` through `Icon.custom(id)`. The bytes are kept as the
 * file holds them — normally PNG — and nothing here decodes them.
 */
export class CustomIcon {
  constructor(
    readonly id: string,
    readonly data: Uint8Array,
    readonly name: string = "",
  ) {
    if (id.trim() === "") {
      throw new Error("CustomIcon id must not be empty");
    }
  }

  static create(data: Uint8Array, name = ""): CustomIcon {
    return new CustomIcon(crypto.randomUUID(), data, name);
  }
}

/** The vault's custom icons, in file order. Every change returns a new set. */
export class CustomIcons {
  static readonly EMPTY = new CustomIcons();

  private readonly byId: ReadonlyMap<string, CustomIcon>;

  constructor(icons: readonly CustomIcon[] = []) {
    this.byId = new Map(icons.map((icon) => [icon.id, icon]));
  }

  get values(): readonly CustomIcon[] {
    return Array.from(this.byId.values());
  }

  get size(): number {
    return this.byId.size;
  }

  get(id: string): CustomIcon | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Adds `icon`, replacing one with the same id. */
  add(icon: CustomIcon): CustomIcons {
    return new CustomIcons([...this.values.filter((existing) => existing.id !== icon.id), icon]);
  }

  remove(id: string): CustomIcons {
    return this.has(id) ? new CustomIcons(this.values.filter((icon) => icon.id !== id)) : this;
  }
}
