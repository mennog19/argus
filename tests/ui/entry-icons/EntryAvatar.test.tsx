import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ReactNode } from "react";
import { CustomIcon, CustomIcons, Icon } from "../../../src/domain";
import { CustomIconsContext } from "../../../src/ui/entry-icons/custom-icons-context";
import { EntryAvatar, GroupAvatar } from "../../../src/ui/entry-icons/EntryAvatar";
import { sigilFor } from "../../../src/ui/entry-icons/sigil";

function renderAvatar(url: string, icon = Icon.AUTO, size?: "sm" | "lg") {
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
    const { container, root } = renderAvatar("https://example.com", Icon.library("luggage"));
    expect(root.dataset.kind).toBe("library");
    expect(root.dataset.hue).toBe(String(sigilFor("example.com").hue));
    expect(container.querySelector(".entry-tile-glyph")).toBeInTheDocument();
  });

  it("lets a manual hue override the name-derived colour of a chosen icon", () => {
    const { root } = renderAvatar("https://example.com", Icon.library("luggage", 235));
    expect(root.dataset.hue).toBe("235");
    expect(root.style.getPropertyValue("--sigil-hue")).toBe("235");
  });

  it("renders the large variant", () => {
    expect(renderAvatar("", Icon.AUTO, "lg").root).toHaveClass("entry-tile", "entry-tile-lg");
    expect(renderAvatar("https://github.com", Icon.AUTO, "lg").root).toHaveClass(
      "entry-tile-brand",
      "entry-tile-lg",
    );
  });

  describe("custom icons", () => {
    const logo = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000abcd", new Uint8Array([1, 2]));
    const icon = Icon.custom(logo.id);

    function withIcons(children: ReactNode) {
      return (
        <CustomIconsContext value={{ icons: new CustomIcons([logo]) }}>
          {children}
        </CustomIconsContext>
      );
    }

    it("draws the vault's image for an entry, in every size", () => {
      const { container } = render(
        withIcons(
          <>
            <EntryAvatar entry={{ title: "Bank", url: "", icon }} />
            <EntryAvatar entry={{ title: "Bank", url: "", icon }} size="lg" />
            <EntryAvatar entry={{ title: "Bank", url: "", icon }} size="xs" />
          </>,
        ),
      );
      const tiles = container.querySelectorAll<HTMLElement>(".entry-tile");
      expect(tiles[0]).toHaveClass("entry-tile-custom");
      expect(tiles[0].dataset.kind).toBe("custom");
      expect(tiles[1]).toHaveClass("entry-tile-lg");
      expect(tiles[2]).toHaveClass("entry-tile-xs");
      expect(tiles[0].querySelector("img")).toHaveAttribute("src", "data:image/png;base64,AQI=");
    });

    it("draws the vault's image for a group", () => {
      const { container } = render(withIcons(<GroupAvatar name="Work" icon={icon} />));
      expect(container.querySelector("img")).toBeInTheDocument();
    });

    it("falls back to automatic outside a vault that holds the image", () => {
      const { root } = renderAvatar("", icon);
      expect(root.dataset.kind).toBe("sigil");
    });
  });
});
