export type IconKind = "auto" | "sigil" | "library" | "brand" | "custom";

const KEY_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Degrees on the hue wheel; whole numbers only, wrapping at 360. */
const MAX_HUE = 359;

/**
 * Which icon an entry or group shows. `auto` lets the UI decide (brand logo
 * for a known site, otherwise a generated sigil); `sigil` insists on the
 * generated sigil even where a brand logo would match; `library` and `brand`
 * are explicit choices identified by a catalog key. The domain only validates the
 * shape — which keys exist is up to the UI's catalogs, so unknown keys (e.g.
 * written by a newer version) survive a round trip untouched. `custom` points
 * at one of the vault's own image icons by its (lowercase UUID) id.
 *
 * A library icon's tint is normally derived from the owner's title/URL (so it
 * matches the automatic sigil it replaced); `hue` overrides that with a fixed
 * OKLCH hue, chosen independently of what's typed into the name field.
 */
export class Icon {
  static readonly AUTO = new Icon("auto", "", undefined);
  static readonly SIGIL = new Icon("sigil", "", undefined);

  private constructor(
    readonly kind: IconKind,
    readonly key: string,
    readonly hue: number | undefined,
  ) {}

  static library(key: string, hue?: number): Icon {
    return new Icon("library", Icon.validKey(key), Icon.validHue(hue));
  }

  static brand(key: string): Icon {
    return new Icon("brand", Icon.validKey(key), undefined);
  }

  static custom(id: string): Icon {
    if (!UUID_PATTERN.test(id)) {
      throw new Error(`Invalid custom icon id: "${id}"`);
    }
    return new Icon("custom", id, undefined);
  }

  /** Parses the `kind:key` or `library:key:hue` form produced by `toString()`; `undefined` if it isn't one. */
  static parse(value: string): Icon | undefined {
    if (value === "auto") {
      return Icon.AUTO;
    }
    if (value === "sigil") {
      return Icon.SIGIL;
    }
    const match = /^(library|brand|custom):([^:]+)(?::(\d+))?$/.exec(value);
    if (!match || !KEY_PATTERN.test(match[2])) {
      return undefined;
    }
    if (match[1] === "custom") {
      return match[3] === undefined && UUID_PATTERN.test(match[2])
        ? Icon.custom(match[2])
        : undefined;
    }
    if (match[1] === "brand") {
      return match[3] === undefined ? Icon.brand(match[2]) : undefined;
    }
    if (match[3] === undefined) {
      return Icon.library(match[2]);
    }
    const hue = Number(match[3]);
    return hue <= MAX_HUE ? Icon.library(match[2], hue) : undefined;
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

  equals(other: Icon): boolean {
    return other.kind === this.kind && other.key === this.key && other.hue === this.hue;
  }

  toString(): string {
    if (this.kind === "auto" || this.kind === "sigil") {
      return this.kind;
    }
    const suffix = this.hue === undefined ? "" : `:${this.hue}`;
    return `${this.kind}:${this.key}${suffix}`;
  }
}
