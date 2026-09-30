import { CustomIcon, CustomIcons, Icon } from "../../domain";
import { BRAND_ICONS, BrandCatalog, BrandIcon } from "./brand-icons";
import { findLibraryIcon, LibraryIcon } from "./library-icons";
import { hostOf, sigilSeed } from "./sigil";

export interface IconSubject {
  title: string;
  url: string;
  icon: Icon;
}

export type ResolvedIcon =
  | { kind: "sigil"; seed: string }
  | { kind: "library"; icon: LibraryIcon; seed: string; hue?: number }
  | { kind: "brand"; icon: BrandIcon }
  | { kind: "custom"; icon: CustomIcon };

/**
 * What an entry actually shows. An explicit choice wins; otherwise a known
 * site gets its logo, a title matching a brand's name gets that brand's
 * logo, and anything else its generated sigil. A key the catalogs don't
 * know (e.g. written by a newer Argus), or a custom icon the vault no longer
 * holds, falls back to automatic.
 */
export function resolveIcon(
  { title, url, icon }: IconSubject,
  brands: BrandCatalog = BRAND_ICONS,
  customIcons: CustomIcons = CustomIcons.EMPTY,
): ResolvedIcon {
  const seed = sigilSeed(title, url);
  if (icon.kind === "custom") {
    const custom = customIcons.get(icon.key);
    if (custom) {
      return { kind: "custom", icon: custom };
    }
  }
  if (icon.kind === "library") {
    const library = findLibraryIcon(icon.key);
    if (library) {
      return { kind: "library", icon: library, seed, hue: icon.hue };
    }
  }
  const chosenBrand = icon.kind === "brand" ? brands.find(icon.key) : undefined;
  const brand = chosenBrand ?? brands.matchHost(hostOf(url) ?? "") ?? brands.matchTitle(title);
  return brand ? { kind: "brand", icon: brand } : { kind: "sigil", seed };
}
