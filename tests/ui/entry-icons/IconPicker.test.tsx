import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Icon } from "../../../src/domain";
import { createBrandCatalog } from "../../../src/ui/entry-icons/brand-icons";
import { IconPicker } from "../../../src/ui/entry-icons/IconPicker";

const brands = createBrandCatalog([
  { slug: "github", title: "GitHub", hex: "181717", domains: ["github.com"], path: "M0 0" },
  { slug: "notion", title: "Notion", hex: "000000", domains: ["notion.so"], path: "M1 1" },
]);

function Harness({
  initial = Icon.AUTO,
  url = "",
  onChange = () => {},
  initiallyOpen = false,
}: {
  initial?: Icon;
  url?: string;
  onChange?: (icon: Icon) => void;
  initiallyOpen?: boolean;
}) {
  const [icon, setIcon] = useState(initial);
  return (
    <IconPicker
      value={icon}
      title="Title"
      url={url}
      brands={brands}
      initiallyOpen={initiallyOpen}
      onChange={(next) => {
        setIcon(next);
        onChange(next);
      }}
    />
  );
}

describe("IconPicker", () => {
  it("describes an automatic icon, naming the detected brand", () => {
    const { unmount } = render(<Harness />);
    expect(screen.getByText("Automatic")).toBeInTheDocument();
    unmount();

    render(<Harness url="https://github.com" />);
    expect(screen.getByText("Automatic · GitHub")).toBeInTheDocument();
  });

  it("describes chosen icons by name", () => {
    const { unmount } = render(<Harness initial={Icon.library("star")} />);
    expect(screen.getByText("Star")).toBeInTheDocument();
    unmount();

    render(<Harness initial={Icon.brand("notion")} />);
    expect(screen.getByText("Notion")).toBeInTheDocument();
  });

  it("describes an unknown chosen icon by what it falls back to", () => {
    const { unmount } = render(
      <Harness initial={Icon.library("from-the-future")} url="https://github.com" />,
    );
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    unmount();

    render(<Harness initial={Icon.brand("gone")} />);
    expect(screen.getByText("Automatic")).toBeInTheDocument();
  });

  it("opens the library, picks an icon, and closes again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Change icon" }));
    expect(screen.getByRole("tab", { name: "Icons" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: "Luggage" }));
    expect(onChange).toHaveBeenCalledWith(Icon.library("luggage"));
    expect(screen.getByRole("button", { name: "Luggage" })).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Luggage", { selector: ".icon-picker-current-name" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("tab", { name: "Icons" })).not.toBeInTheDocument();
  });

  it("searches icons by label and keyword", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Change icon" }));

    await user.type(screen.getByRole("searchbox", { name: "Search icons" }), "travel");
    expect(screen.getByRole("button", { name: "Luggage" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Star" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search icons" }), "zzz");
    expect(screen.getByText('Nothing matches "travelzzz".')).toBeInTheDocument();
  });

  it("picks and searches brands", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Change icon" }));
    await user.click(screen.getByRole("tab", { name: "Brands" }));

    await user.type(screen.getByRole("searchbox", { name: "Search brands" }), "notion.so");
    expect(screen.queryByRole("button", { name: "GitHub" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Notion" }));
    expect(onChange).toHaveBeenCalledWith(Icon.brand("notion"));

    await user.click(screen.getByRole("tab", { name: "Icons" }));
    expect(screen.getByRole("tab", { name: "Icons" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens on the brands tab when a brand is chosen", async () => {
    const user = userEvent.setup();
    render(<Harness initial={Icon.brand("github")} />);
    await user.click(screen.getByRole("button", { name: "Change icon" }));
    expect(screen.getByRole("tab", { name: "Brands" })).toHaveAttribute("aria-selected", "true");
  });

  it("resets to automatic", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={Icon.library("star")} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Use automatic" }));
    expect(onChange).toHaveBeenCalledWith(Icon.AUTO);
    expect(screen.queryByRole("button", { name: "Use automatic" })).not.toBeInTheDocument();
  });

  it("shows colour swatches only for a chosen library icon", async () => {
    const { unmount } = render(<Harness />);
    expect(screen.queryByRole("group", { name: "Icon colour" })).not.toBeInTheDocument();
    unmount();

    render(<Harness initial={Icon.brand("github")} />);
    expect(screen.queryByRole("group", { name: "Icon colour" })).not.toBeInTheDocument();
  });

  it("overrides a library icon's name-derived colour with a chosen hue", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={Icon.library("star")} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Match name" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Set colour, hue 235" }));
    expect(onChange).toHaveBeenCalledWith(Icon.library("star", 235));
    expect(screen.getByRole("button", { name: "Set colour, hue 235" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Match name" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Match name" }));
    expect(onChange).toHaveBeenCalledWith(Icon.library("star"));
  });

  it("keeps a colour override when switching to a different library icon", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={Icon.library("star", 235)} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Change icon" }));
    await user.click(screen.getByRole("button", { name: "Luggage" }));
    expect(onChange).toHaveBeenCalledWith(Icon.library("luggage", 235));
  });

  it("starts with the grid already expanded when initiallyOpen is set", () => {
    render(<Harness initiallyOpen />);
    expect(screen.getByRole("tab", { name: "Icons" })).toBeInTheDocument();
  });

  it("uses the bundled brand catalog by default", async () => {
    const user = userEvent.setup();
    render(<IconPicker value={Icon.AUTO} title="" url="" onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Change icon" }));
    await user.click(screen.getByRole("tab", { name: "Brands" }));
    expect(screen.getByRole("button", { name: "GitHub" })).toBeInTheDocument();
  });
});
