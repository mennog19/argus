import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { EntryIcon } from "../../domain";
import { EntryAvatar } from "./EntryAvatar";
import { sigilFor } from "./sigil";

function renderAvatar(url: string, icon = EntryIcon.AUTO, size?: "sm" | "lg") {
  const { container } = render(<EntryAvatar entry={{ title: "Title", url, icon }} size={size} />);
  return { container, root: container.firstElementChild as HTMLElement };
}

describe("EntryAvatar", () => {
  it("draws the generated sigil for an unknown site", () => {
    const { container, root } = renderAvatar("https://example.com");
    const expected = sigilFor("example.com");

    expect(root).toHaveClass("entry-tile");
    expect(root).not.toHaveClass("entry-tile-lg");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.dataset.kind).toBe("sigil");
    expect(root.dataset.hue).toBe(String(expected.hue));
    expect(root.style.getPropertyValue("--sigil-hue")).toBe(String(expected.hue));
    expect(container.querySelector(".entry-sigil-pupil")).toHaveAttribute(
      "r",
      String(expected.pupilRadius),
    );
    expect(container.querySelector(".entry-sigil-outer")).toHaveAttribute(
      "transform",
      `rotate(${expected.outerRotation} 16 16)`,
    );
    expect(container.querySelector(".entry-sigil-inner")).toHaveAttribute(
      "transform",
      `rotate(${expected.innerRotation} 16 16)`,
    );
  });

  it("draws the same sigil for entries on the same site", () => {
    const first = renderAvatar("https://example.com/a").container.innerHTML;
    const second = renderAvatar("example.com").container.innerHTML;
    expect(first).toBe(second);
  });

  it("draws a known site's logo in its brand colours", () => {
    const { container, root } = renderAvatar("https://github.com");
    expect(root).toHaveClass("entry-tile", "entry-tile-brand");
    expect(root.dataset.kind).toBe("brand");
    expect(root.style.getPropertyValue("--brand-color")).toBe("#181717");
    expect(root.style.getPropertyValue("--brand-glyph")).toBe("#eceef1");
    expect(container.querySelector("path")?.getAttribute("d")).toBeTruthy();
  });

  it("draws a chosen library icon tinted with the site's hue", () => {
    const { container, root } = renderAvatar("https://example.com", EntryIcon.library("luggage"));
    expect(root.dataset.kind).toBe("library");
    expect(root.dataset.hue).toBe(String(sigilFor("example.com").hue));
    expect(container.querySelector(".entry-tile-glyph")).toBeInTheDocument();
  });

  it("renders the large variant", () => {
    expect(renderAvatar("", EntryIcon.AUTO, "lg").root).toHaveClass("entry-tile", "entry-tile-lg");
    expect(renderAvatar("https://github.com", EntryIcon.AUTO, "lg").root).toHaveClass(
      "entry-tile-brand",
      "entry-tile-lg",
    );
  });
});
