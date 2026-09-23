import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EntrySortId } from "../../application/settings";
import { EntrySortMenu } from "./EntrySortMenu";

function renderMenu(value: EntrySortId = "manual") {
  const onChange = vi.fn();
  render(<EntrySortMenu value={value} onChange={onChange} />);
  return { onChange };
}

function trigger() {
  return screen.getByRole("button", { name: /^Sort entries/ });
}

describe("EntrySortMenu", () => {
  it("keeps the menu closed until the trigger is clicked", () => {
    renderMenu();

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger());

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("lists every sort order, marking the active one", () => {
    renderMenu("title-asc");
    fireEvent.click(trigger());

    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "Vault order",
      "Title (A–Z)",
      "Title (Z–A)",
      "Recently opened",
      "Least recently opened",
    ]);
    expect(screen.getByRole("menuitemradio", { name: "Title (A–Z)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Vault order" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("reports the chosen order and closes", () => {
    const { onChange } = renderMenu();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Least recently opened" }));

    expect(onChange).toHaveBeenCalledWith("accessed-asc");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when the trigger is clicked again", () => {
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.click(trigger());

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on a click outside, but not on one inside the menu", () => {
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("leaves the menu open for a mousedown on the trigger, so its own click can toggle it", () => {
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.mouseDown(trigger());

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape, and ignores other keys", () => {
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.keyDown(document, { key: "a" });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks the trigger as sorted only when the list isn't in vault order", () => {
    const { unmount } = render(<EntrySortMenu value="manual" onChange={vi.fn()} />);
    expect(trigger().className).not.toContain("sorted");
    unmount();

    render(<EntrySortMenu value="accessed-desc" onChange={vi.fn()} />);
    expect(trigger().className).toContain("sorted");
  });
});

describe("EntrySortMenu placement", () => {
  function openAt(right: number, width: number) {
    render(<EntrySortMenu value="manual" onChange={vi.fn()} />);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
    vi.spyOn(trigger(), "getBoundingClientRect").mockReturnValue({
      right,
      bottom: 100,
    } as DOMRect);
    fireEvent.click(trigger());
    return screen.getByRole("menu");
  }

  it("hangs off the trigger's right edge", () => {
    expect(openAt(500, 1200).style.left).toBe("284px");
  });

  it("never runs off the left edge of a narrow window", () => {
    expect(openAt(120, 1200).style.left).toBe("8px");
  });

  it("never runs off the right edge of a narrow window", () => {
    // 176 + 216 wide = 392, leaving the 8px gutter against a 400px window.
    expect(openAt(900, 400).style.left).toBe("176px");
  });
});
