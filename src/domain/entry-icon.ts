export type EntryIconKind = "auto" | "library" | "brand";

const KEY_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

/**
 * Which icon an entry shows. `auto` lets the UI decide (brand logo for a known
 * site, otherwise a generated sigil); `library` and `brand` are explicit
 * choices identified by a catalog key. The domain only validates the shape —
 * which keys exist is up to the UI's catalogs, so unknown keys (e.g. written
 * by a newer version) survive a round trip untouched.
 */
export class EntryIcon {
  static readonly AUTO = new EntryIcon("auto", "");

  private constructor(
    readonly kind: EntryIconKind,
    readonly key: string,
  ) {}

  static library(key: string): EntryIcon {
    return new EntryIcon("library", EntryIcon.validKey(key));
  }

  static brand(key: string): EntryIcon {
    return new EntryIcon("brand", EntryIcon.validKey(key));
  }

  /** Parses the `kind:key` form produced by `toString()`; `undefined` if it isn't one. */
  static parse(value: string): EntryIcon | undefined {
    if (value === "auto") {
      return EntryIcon.AUTO;
    }
    const match = /^(library|brand):(.+)$/.exec(value);
    if (!match || !KEY_PATTERN.test(match[2])) {
      return undefined;
    }
    return match[1] === "library" ? EntryIcon.library(match[2]) : EntryIcon.brand(match[2]);
  }

  private static validKey(key: string): string {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`Invalid icon key: "${key}"`);
    }
    return key;
  }

  equals(other: EntryIcon): boolean {
    return other.kind === this.kind && other.key === this.key;
  }

  toString(): string {
    return this.kind === "auto" ? "auto" : `${this.kind}:${this.key}`;
  }
}
