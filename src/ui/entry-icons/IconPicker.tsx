import { ChangeEvent, CSSProperties, KeyboardEvent, ReactNode, useState } from "react";
import { CustomIcon, Icon } from "../../domain";
import { useAsyncAction } from "../use-async-action";
import { BRAND_ICONS, BrandCatalog } from "./brand-icons";
import { iconImageFromFile } from "./custom-icon-image";
import { useCustomIcons } from "./custom-icons-context";
import { EntryTile } from "./EntryAvatar";
import { LIBRARY_ICONS } from "./library-icons";
import { resolveIcon } from "./resolve-entry-icon";
import { HUES, sigilSeed } from "./sigil";

type Tab = "library" | "brands" | "custom";

interface Option {
  id: string;
  label: string;
  choose: () => void;
  pressed: boolean;
  tile: ReactNode;
}

const SIGIL_LABEL = "Generated symbol";
const SIGIL_KEYWORDS = ["generated", "symbol", "sigil", "eye", "default"];

interface IconPickerProps {
  value: Icon;
  title: string;
  url: string;
  /**
   * `added` is set when the choice is an image the user just uploaded: it
   * isn't in the vault yet, and the owner saves it along with the choice.
   */
  onChange: (icon: Icon, added?: CustomIcon) => void;
  brands?: BrandCatalog;
  /**
   * Keeps the library/brand grid showing, with no button to fold it away —
   * for a host that is itself a popover and closes as a whole.
   */
  alwaysOpen?: boolean;
}

function matches(query: string, words: readonly string[]): boolean {
  return words.some((word) => word.toLowerCase().includes(query));
}

function initialTab(value: Icon): Tab {
  if (value.kind === "brand") {
    return "brands";
  }
  return value.kind === "custom" ? "custom" : "library";
}

/** A file name without its extension, as the icon's name in KeePass. */
function iconName(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, "");
}

function usageWarning(usage: number): string {
  if (usage === 0) {
    return "Nothing uses it right now.";
  }
  return usage === 1
    ? "1 entry or group uses it and will go back to its automatic icon."
    : `${usage} entries and groups use it and will go back to their automatic icons.`;
}

export function IconPicker({
  value,
  title,
  url,
  onChange,
  brands = BRAND_ICONS,
  alwaysOpen = false,
}: IconPickerProps) {
  const library = useCustomIcons();
  const [toggledOpen, setToggledOpen] = useState(false);
  const open = alwaysOpen || toggledOpen;
  const [tab, setTab] = useState<Tab>(initialTab(value));
  const [query, setQuery] = useState("");
  // Uploads not saved yet; they reach the vault through `onChange`'s owner.
  const [uploaded, setUploaded] = useState<readonly CustomIcon[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { busy, error, run } = useAsyncAction();

  const customIcons = uploaded.reduce((icons, icon) => icons.add(icon), library.icons);
  const subject = { title, url, icon: value };
  const resolved = resolveIcon(subject, brands, customIcons);
  const seed = sigilSeed(title, url);
  const normalizedQuery = query.trim().toLowerCase();
  const editor = library.editor;
  // Only an icon already in the vault can be deleted from it.
  const deleteTarget =
    editor && value.kind === "custom" && library.icons.has(value.key)
      ? { id: value.key, editor }
      : undefined;

  let description: string;
  if (value.kind === "auto") {
    description = resolved.kind === "brand" ? `Automatic · ${resolved.icon.title}` : "Automatic";
  } else {
    // A chosen key the catalogs don't know resolves to something else; call it what it shows.
    switch (resolved.kind) {
      case "library":
        description = resolved.icon.label;
        break;
      case "brand":
        description = resolved.icon.title;
        break;
      case "custom":
        description = resolved.icon.name || "Custom image";
        break;
      default:
        description = value.kind === "sigil" ? SIGIL_LABEL : "Automatic";
    }
  }

  // Switching icons keeps a manual colour override rather than dropping it.
  const currentHue = value.kind === "library" ? value.hue : undefined;

  function chooseCustom(icon: CustomIcon) {
    onChange(Icon.custom(icon.id), library.icons.has(icon.id) ? undefined : icon);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared so picking the same file again still fires a change.
    input.value = "";
    if (!file) {
      return;
    }
    await run(async () => {
      const icon = CustomIcon.create(await iconImageFromFile(file), iconName(file.name));
      setUploaded((current) => [...current, icon]);
      onChange(Icon.custom(icon.id), icon);
    }, "Couldn't add that image.");
  }

  async function handleDelete(id: string, remove: (id: string) => Promise<void>) {
    const deleted = await run(() => remove(id), "Couldn't delete the icon.");
    if (deleted) {
      setConfirmingDelete(false);
      setUploaded((current) => current.filter((icon) => icon.id !== id));
    }
  }

  /**
   * The generated sigil leads the library: picking it is how an entry whose
   * name or site matches a brand gets its own symbol back instead of the logo.
   */
  function libraryOptions(): Option[] {
    const sigil: Option = {
      id: "sigil",
      label: SIGIL_LABEL,
      choose: () => onChange(Icon.SIGIL),
      pressed: value.kind === "sigil",
      tile: <EntryTile resolved={{ kind: "sigil", seed }} />,
    };
    return [
      ...(matches(normalizedQuery, SIGIL_KEYWORDS) ? [sigil] : []),
      ...LIBRARY_ICONS.filter((icon) =>
        matches(normalizedQuery, [icon.key, icon.label, ...icon.keywords]),
      ).map((icon) => ({
        id: `library:${icon.key}`,
        label: icon.label,
        choose: () => onChange(Icon.library(icon.key, currentHue)),
        pressed: value.kind === "library" && value.key === icon.key,
        tile: <EntryTile resolved={{ kind: "library", icon, seed, hue: currentHue }} />,
      })),
    ];
  }

  function brandOptions(): Option[] {
    return brands.all
      .filter((brand) => matches(normalizedQuery, [brand.slug, brand.title, ...brand.domains]))
      .map((brand) => ({
        id: `brand:${brand.slug}`,
        label: brand.title,
        choose: () => onChange(Icon.brand(brand.slug)),
        pressed: value.kind === "brand" && value.key === brand.slug,
        tile: <EntryTile resolved={{ kind: "brand", icon: brand }} />,
      }));
  }

  function customOptions(): Option[] {
    return customIcons.values.map((icon) => ({
      id: icon.id,
      label: icon.name || "Custom image",
      choose: () => chooseCustom(icon),
      pressed: value.kind === "custom" && value.key === icon.id,
      tile: <EntryTile resolved={{ kind: "custom", icon }} />,
    }));
  }

  // A search looks through the icons and the brands at once, whichever of
  // those two tabs it was typed on.
  function currentOptions(): Option[] {
    if (tab === "custom") {
      return customOptions();
    }
    if (normalizedQuery !== "") {
      return [...libraryOptions(), ...brandOptions()];
    }
    return tab === "library" ? libraryOptions() : brandOptions();
  }

  const options = currentOptions();

  // Escape folds the grid away again. A host popover closes itself instead.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setToggledOpen(false);
    }
  }

  function renderEmpty() {
    if (tab === "custom") {
      return <div className="icon-picker-empty">This vault has no custom icons yet.</div>;
    }
    return <div className="icon-picker-empty">Nothing matches "{query.trim()}".</div>;
  }

  return (
    <div className="icon-picker" onKeyDown={handleKeyDown}>
      <div className="icon-picker-current">
        <EntryTile resolved={resolved} size="lg" />
        <div className="icon-picker-current-text">
          <span className="field-label">Icon</span>
          <span className="icon-picker-current-name">{description}</span>
        </div>
        <div className="icon-picker-current-actions">
          {value.kind !== "auto" && (
            <button type="button" className="link-muted" onClick={() => onChange(Icon.AUTO)}>
              Use automatic
            </button>
          )}
          {!alwaysOpen && (
            <button
              type="button"
              className="btn-secondary"
              aria-expanded={open}
              onClick={() => setToggledOpen((isOpen) => !isOpen)}
            >
              {open ? "Done" : "Change icon"}
            </button>
          )}
        </div>
      </div>

      {value.kind === "library" && (
        <div className="icon-picker-colors" role="group" aria-label="Icon colour">
          <button
            type="button"
            className="icon-picker-color icon-picker-color-auto"
            title="Match name"
            aria-label="Match name"
            aria-pressed={value.hue === undefined}
            onClick={() => onChange(Icon.library(value.key))}
          />
          {HUES.map((hue) => (
            <button
              key={hue}
              type="button"
              className="icon-picker-color"
              style={{ "--swatch-hue": hue } as CSSProperties}
              title="Set colour"
              aria-label={`Set colour, hue ${hue}`}
              aria-pressed={value.hue === hue}
              onClick={() => onChange(Icon.library(value.key, hue))}
            />
          ))}
        </div>
      )}

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
              <button
                type="button"
                role="tab"
                aria-selected={tab === "custom"}
                onClick={() => setTab("custom")}
              >
                Custom
              </button>
            </div>
            {tab === "custom" ? (
              editor && (
                <label className="btn-secondary icon-picker-upload" aria-disabled={busy}>
                  Upload image…
                  <input
                    type="file"
                    accept="image/*"
                    aria-label="Upload image"
                    disabled={busy}
                    onChange={(event) => void handleUpload(event)}
                  />
                </label>
              )
            ) : (
              <input
                type="search"
                className="field-input icon-picker-search"
                placeholder="Search icons and brands"
                aria-label="Search icons and brands"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </div>
          {tab === "custom" && editor && (
            <p className="icon-picker-note">
              Images are stored inside this vault. If you delete one, it can't be loaded again;
              you'd have to upload the image once more.
            </p>
          )}
          {error && <div className="field-error">{error}</div>}
          {options.length === 0 ? (
            renderEmpty()
          ) : (
            <div className="icon-picker-grid">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="icon-picker-option"
                  title={option.label}
                  aria-label={option.label}
                  aria-pressed={option.pressed}
                  onClick={option.choose}
                >
                  {option.tile}
                </button>
              ))}
            </div>
          )}
          {tab === "custom" &&
            deleteTarget &&
            (confirmingDelete ? (
              <div className="icon-picker-delete-confirm" role="alert">
                <strong>Delete this icon from the vault?</strong>
                <span>
                  {usageWarning(deleteTarget.editor.usage(deleteTarget.id))} The image can't be
                  loaded again after this. You'd have to upload it once more.
                </span>
                <div className="icon-picker-delete-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={busy}
                    onClick={() => void handleDelete(deleteTarget.id, deleteTarget.editor.remove)}
                  >
                    Delete icon
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="link-muted icon-picker-delete"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete this icon from the vault…
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
