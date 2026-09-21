import { useState } from "react";
import { EntryIcon } from "../../domain";
import { BRAND_ICONS, BrandCatalog } from "./brand-icons";
import { EntryAvatar, EntryTile } from "./EntryAvatar";
import { LIBRARY_ICONS } from "./library-icons";
import { resolveEntryIcon } from "./resolve-entry-icon";
import { sigilSeed } from "./sigil";

type Tab = "library" | "brands";

interface IconPickerProps {
  value: EntryIcon;
  title: string;
  url: string;
  onChange: (icon: EntryIcon) => void;
  brands?: BrandCatalog;
}

function matches(query: string, words: readonly string[]): boolean {
  return words.some((word) => word.toLowerCase().includes(query));
}

export function IconPicker({ value, title, url, onChange, brands = BRAND_ICONS }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(value.kind === "brand" ? "brands" : "library");
  const [query, setQuery] = useState("");

  const subject = { title, url, icon: value };
  const resolved = resolveEntryIcon(subject, brands);
  const seed = sigilSeed(title, url);
  const normalizedQuery = query.trim().toLowerCase();

  let description: string;
  if (value.kind === "auto") {
    description = resolved.kind === "brand" ? `Automatic · ${resolved.icon.title}` : "Automatic";
  } else {
    // A chosen key the catalogs don't know resolves to something else; call it what it shows.
    description =
      resolved.kind === "library"
        ? resolved.icon.label
        : resolved.kind === "brand"
          ? resolved.icon.title
          : "Automatic";
  }

  const options =
    tab === "library"
      ? LIBRARY_ICONS.filter((icon) =>
          matches(normalizedQuery, [icon.key, icon.label, ...icon.keywords]),
        ).map((icon) => ({
          id: icon.key,
          label: icon.label,
          choice: EntryIcon.library(icon.key),
          tile: <EntryTile resolved={{ kind: "library", icon, seed }} />,
        }))
      : brands.all
          .filter((brand) => matches(normalizedQuery, [brand.slug, brand.title, ...brand.domains]))
          .map((brand) => ({
            id: brand.slug,
            label: brand.title,
            choice: EntryIcon.brand(brand.slug),
            tile: <EntryTile resolved={{ kind: "brand", icon: brand }} />,
          }));

  return (
    <div className="icon-picker">
      <div className="icon-picker-current">
        <EntryAvatar entry={subject} size="lg" />
        <div className="icon-picker-current-text">
          <span className="field-label">Icon</span>
          <span className="icon-picker-current-name">{description}</span>
        </div>
        <div className="icon-picker-current-actions">
          {value.kind !== "auto" && (
            <button type="button" className="link-muted" onClick={() => onChange(EntryIcon.AUTO)}>
              Use automatic
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            aria-expanded={open}
            onClick={() => setOpen((isOpen) => !isOpen)}
          >
            {open ? "Done" : "Change icon"}
          </button>
        </div>
      </div>

      {open && (
        <div className="icon-picker-panel">
          <div className="icon-picker-toolbar">
            <div className="icon-picker-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "library"}
                onClick={() => setTab("library")}
              >
                Icons
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "brands"}
                onClick={() => setTab("brands")}
              >
                Brands
              </button>
            </div>
            <input
              type="search"
              className="field-input icon-picker-search"
              placeholder={tab === "library" ? "Search icons" : "Search brands"}
              aria-label={tab === "library" ? "Search icons" : "Search brands"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {options.length === 0 ? (
            <div className="icon-picker-empty">Nothing matches "{query.trim()}".</div>
          ) : (
            <div className="icon-picker-grid">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="icon-picker-option"
                  title={option.label}
                  aria-label={option.label}
                  aria-pressed={option.choice.equals(value)}
                  onClick={() => onChange(option.choice)}
                >
                  {option.tile}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
