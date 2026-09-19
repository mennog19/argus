import { Tag } from "./tag";

/**
 * An immutable, de-duplicated set of tags. Every mutation returns a new
 * `Tags` instance rather than changing this one.
 */
export class Tags {
  private readonly items: readonly Tag[];

  constructor(tags: readonly Tag[] = []) {
    const unique = new Map<string, Tag>();
    for (const tag of tags) {
      unique.set(tag.toString(), tag);
    }
    this.items = Array.from(unique.values());
  }

  get values(): readonly Tag[] {
    return this.items;
  }

  has(tag: Tag): boolean {
    return this.items.some((item) => item.equals(tag));
  }

  add(tag: Tag): Tags {
    if (this.has(tag)) {
      return this;
    }
    return new Tags([...this.items, tag]);
  }

  remove(tag: Tag): Tags {
    return new Tags(this.items.filter((item) => !item.equals(tag)));
  }
}
