import { BRAND_ICON_DATA } from "./brands.generated";

/** One brand as baked in by scripts/generate-brand-icons.mjs. */
export interface BrandIconData {
  slug: string;
  title: string;
  /** Official brand colour, 6-digit hex without `#`. */
  hex: string;
  domains: readonly string[];
  /** SVG path in a 24×24 viewBox. */
  path: string;
}

export interface BrandIcon extends BrandIconData {
  /** Colour to draw the logo in on Argus's dark surfaces. */
  glyphColor: string;
}

const LIGHT_GLYPH = "#eceef1";

/** WCAG relative luminance of a 6-digit hex colour. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** The brand colour, unless it's too dark to read on a near-black tile (GitHub, X, Apple…). */
export function brandGlyphColor(hex: string): string {
  return luminance(hex) < 0.05 ? LIGHT_GLYPH : `#${hex}`;
}

export interface BrandCatalog {
  readonly all: readonly BrandIcon[];
  find(slug: string): BrandIcon | undefined;
  /** The brand owning `host` or its nearest parent domain (`mail.google.com` → `google.com`). */
  matchHost(host: string): BrandIcon | undefined;
  /** The brand whose name exactly matches `title` (case- and spacing-insensitive). */
  matchTitle(title: string): BrandIcon | undefined;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function createBrandCatalog(data: readonly BrandIconData[]): BrandCatalog {
  const all = data.map((brand) => ({ ...brand, glyphColor: brandGlyphColor(brand.hex) }));
  const bySlug = new Map(all.map((brand) => [brand.slug, brand]));
  const byDomain = new Map(all.flatMap((brand) => brand.domains.map((domain) => [domain, brand])));
  const byTitle = new Map(all.map((brand) => [normalizeTitle(brand.title), brand]));

  return {
    all,
    find: (slug) => bySlug.get(slug),
    matchHost(host) {
      const labels = host.toLowerCase().split(".");
      for (let start = 0; start <= labels.length - 2; start++) {
        const match = byDomain.get(labels.slice(start).join("."));
        if (match) {
          return match;
        }
      }
      return undefined;
    },
    matchTitle: (title) => byTitle.get(normalizeTitle(title)),
  };
}

export const BRAND_ICONS = createBrandCatalog(BRAND_ICON_DATA);
