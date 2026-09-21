import { EntryIcon } from "../../domain";
import { BRAND_ICONS, BrandCatalog, BrandIcon } from "./brand-icons";
import { findLibraryIcon, LibraryIcon } from "./library-icons";
import { hostOf, sigilSeed } from "./sigil";

export interface EntryIconSubject {
  title: string;
  url: string;
  icon: EntryIcon;
}

export type ResolvedEntryIcon =
  | { kind: "sigil"; seed: string }
  | { kind: "library"; icon: LibraryIcon; seed: string; hue?: number }
  | { kind: "brand"; icon: BrandIcon };

/**
 * What an entry actually shows. An explicit choice wins; otherwise a known
 * site gets its logo and anything else its generated sigil. A key the
 * catalogs don't know (e.g. written by a newer Argus) falls back to automatic.
 */
export function resolveEntryIcon(
  { title, url, icon }: EntryIconSubject,
  brands: BrandCatalog = BRAND_ICONS,
): ResolvedEntryIcon {
  const seed = sigilSeed(title, url);
  if (icon.kind === "library") {
    const library = findLibraryIcon(icon.key);
    if (library) {
      return { kind: "library", icon: library, seed, hue: icon.hue };
    }
  }
  const chosenBrand = icon.kind === "brand" ? brands.find(icon.key) : undefined;
  const brand = chosenBrand ?? brands.matchHost(hostOf(url) ?? "");
  return brand ? { kind: "brand", icon: brand } : { kind: "sigil", seed };
}
