export type EntryIconKind = "auto" | "library" | "brand";

const KEY_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

/** Degrees on the hue wheel; whole numbers only, wrapping at 360. */
const MAX_HUE = 359;

/**
 * Which icon an entry shows. `auto` lets the UI decide (brand logo for a known
 * site, otherwise a generated sigil); `library` and `brand` are explicit
 * choices identified by a catalog key. The domain only validates the shape —
 * which keys exist is up to the UI's catalogs, so unknown keys (e.g. written
 * by a newer version) survive a round trip untouched.
 *
 * A library icon's tint is normally derived from the entry's title/URL (so it
 * matches the automatic sigil it replaced); `hue` overrides that with a fixed
 * OKLCH hue, chosen independently of what's typed into the name field.
 */
export class EntryIcon {
  static readonly AUTO = new EntryIcon("auto", "", undefined);

  private constructor(
    readonly kind: EntryIconKind,
    readonly key: string,
    readonly hue: number | undefined,
  ) {}

  static library(key: string, hue?: number): EntryIcon {
    return new EntryIcon("library", EntryIcon.validKey(key), EntryIcon.validHue(hue));
  }

  static brand(key: string): EntryIcon {
    return new EntryIcon("brand", EntryIcon.validKey(key), undefined);
  }

  /** Parses the `kind:key` or `library:key:hue` form produced by `toString()`; `undefined` if it isn't one. */
  static parse(value: string): EntryIcon | undefined {
    if (value === "auto") {
      return EntryIcon.AUTO;
    }
    const match = /^(library|brand):([^:]+)(?::(\d+))?$/.exec(value);
    if (!match || !KEY_PATTERN.test(match[2])) {
      return undefined;
    }
    if (match[1] === "brand") {
      return match[3] === undefined ? EntryIcon.brand(match[2]) : undefined;
    }
    if (match[3] === undefined) {
      return EntryIcon.library(match[2]);
    }
    const hue = Number(match[3]);
    return hue <= MAX_HUE ? EntryIcon.library(match[2], hue) : undefined;
  }

  private static validKey(key: string): string {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`Invalid icon key: "${key}"`);
    }
    return key;
  }

  private static validHue(hue: number | undefined): number | undefined {
    if (hue === undefined) {
      return undefined;
    }
    if (!Number.isInteger(hue) || hue < 0 || hue > MAX_HUE) {
      throw new Error(`Invalid icon hue: ${hue}`);
    }
    return hue;
  }

  equals(other: EntryIcon): boolean {
    return other.kind === this.kind && other.key === this.key && other.hue === this.hue;
  }

  toString(): string {
    if (this.kind === "auto") {
      return "auto";
    }
    const suffix = this.hue === undefined ? "" : `:${this.hue}`;
    return `${this.kind}:${this.key}${suffix}`;
  }
}
