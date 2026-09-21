import { CSSProperties } from "react";
import { IconSubject, ResolvedIcon, resolveIcon } from "./resolve-entry-icon";
import { Sigil, sigilFor } from "./sigil";

export type EntryTileSize = "xs" | "sm" | "lg";

const OUTER_RADIUS = 11;
const INNER_RADIUS = 6.5;

/** The generated "eye" drawn for entries with no brand or chosen icon. */
function SigilGlyph({ sigil }: { sigil: Sigil }) {
  const outerCircumference = 2 * Math.PI * OUTER_RADIUS;
  const segmentLength = outerCircumference / sigil.segments;
  const outerDash = segmentLength * sigil.segmentFill;
  const innerCircumference = 2 * Math.PI * INNER_RADIUS;
  const innerDash = innerCircumference * sigil.innerSweep;

  return (
    <svg viewBox="0 0 32 32">
      <circle
        className="entry-sigil-outer"
        cx="16"
        cy="16"
        r={OUTER_RADIUS}
        strokeDasharray={`${outerDash} ${segmentLength - outerDash}`}
        transform={`rotate(${sigil.outerRotation} 16 16)`}
      />
      <circle
        className="entry-sigil-inner"
        cx="16"
        cy="16"
        r={INNER_RADIUS}
        strokeDasharray={`${innerDash} ${innerCircumference - innerDash}`}
        transform={`rotate(${sigil.innerRotation} 16 16)`}
      />
      <circle className="entry-sigil-pupil" cx="16" cy="16" r={sigil.pupilRadius} />
    </svg>
  );
}

/** Renders an already-resolved icon as a tile. */
export function EntryTile({
  resolved,
  size = "sm",
}: {
  resolved: ResolvedIcon;
  size?: EntryTileSize;
}) {
  const sizeClass = size === "lg" ? " entry-tile-lg" : size === "xs" ? " entry-tile-xs" : "";

  if (resolved.kind === "brand") {
    const { icon } = resolved;
    return (
      <div
        className={`entry-tile entry-tile-brand${sizeClass}`}
        style={
          { "--brand-color": `#${icon.hex}`, "--brand-glyph": icon.glyphColor } as CSSProperties
        }
        data-kind="brand"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24">
          <path d={icon.path} />
        </svg>
      </div>
    );
  }

  const sigil = sigilFor(resolved.seed);
  const hue = resolved.kind === "library" ? (resolved.hue ?? sigil.hue) : sigil.hue;
  return (
    <div
      className={`entry-tile${sizeClass}`}
      style={{ "--sigil-hue": hue } as CSSProperties}
      data-kind={resolved.kind}
      data-hue={hue}
      aria-hidden="true"
    >
      {resolved.kind === "library" ? (
        <resolved.icon.Icon className="entry-tile-glyph" strokeWidth={1.75} />
      ) : (
        <SigilGlyph sigil={sigil} />
      )}
    </div>
  );
}

/** An entry's icon: its chosen one, its site's logo, or its generated sigil. */
export function EntryAvatar({ entry, size }: { entry: IconSubject; size?: EntryTileSize }) {
  return <EntryTile resolved={resolveIcon(entry)} size={size} />;
}

/** A group's icon: its chosen one, or a sigil generated from its name (groups have no URL to brand-match against). */
export function GroupAvatar({
  name,
  icon,
  size,
}: {
  name: string;
  icon: IconSubject["icon"];
  size?: EntryTileSize;
}) {
  return <EntryTile resolved={resolveIcon({ title: name, url: "", icon })} size={size} />;
}
