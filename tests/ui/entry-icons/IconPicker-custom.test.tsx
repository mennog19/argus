import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { CustomIcon, CustomIcons, Icon } from "../../../src/domain";
import { createBrandCatalog } from "../../../src/ui/entry-icons/brand-icons";
import {
  CustomIconEditor,
  CustomIconsContext,
} from "../../../src/ui/entry-icons/custom-icons-context";
import { IconPicker } from "../../../src/ui/entry-icons/IconPicker";

const { iconImageFromFile } = vi.hoisted(() => ({ iconImageFromFile: vi.fn() }));
vi.mock("../../../src/ui/entry-icons/custom-icon-image", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  iconImageFromFile,
}));

const brands = createBrandCatalog([]);
const LOGO = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000abcd", new Uint8Array([1]), "Logo");
const UNNAMED = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000ef01", new Uint8Array([2]));

function editor(overrides: Partial<CustomIconEditor> = {}): CustomIconEditor {
  return { remove: vi.fn().mockResolvedValue(undefined), usage: () => 0, ...overrides };
}

function Harness({
  initial = Icon.AUTO,
  icons = new CustomIcons([LOGO, UNNAMED]),
  customEditor,
  onChange = () => {},
}: {
  initial?: Icon;
  icons?: CustomIcons;
  customEditor?: CustomIconEditor;
  onChange?: (icon: Icon, added?: CustomIcon) => void;
}) {
  const [icon, setIcon] = useState(initial);
  return (
    <CustomIconsContext value={{ icons, editor: customEditor }}>
      <IconPicker
        value={icon}
        title="Title"
        url=""
        brands={brands}
        initiallyOpen
        onChange={(next, added) => {
          setIcon(next);
          onChange(next, added);
        }}
      />
    </CustomIconsContext>
  );
}

beforeEach(() => {
  iconImageFromFile.mockReset();
});

describe("IconPicker custom icons", () => {
  it("opens on the Custom tab for a custom icon and describes it by name", () => {
    const { unmount } = render(<Harness initial={Icon.custom(LOGO.id)} />);
    expect(screen.getByRole("tab", { name: "Custom" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Logo", { selector: ".icon-picker-current-name" })).toBeInTheDocument();
    unmount();

    render(<Harness initial={Icon.custom(UNNAMED.id)} />);
    expect(
      screen.getByText("Custom image", { selector: ".icon-picker-current-name" }),
    ).toBeInTheDocument();
  });

  it("calls a custom icon the vault no longer holds automatic", () => {
    render(<Harness initial={Icon.custom(LOGO.id)} icons={CustomIcons.EMPTY} />);
    expect(screen.getByText("Automatic")).toBeInTheDocument();
    expect(screen.getByText("This vault has no custom icons yet.")).toBeInTheDocument();
  });

  it("lists the vault's icons and picks one without re-adding it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("tab", { name: "Custom" }));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Logo" }));

    expect(onChange).toHaveBeenCalledWith(Icon.custom(LOGO.id), undefined);
    expect(screen.getByRole("button", { name: "Logo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("only shows icons, no upload or delete, where the vault can't be edited", async () => {
    const user = userEvent.setup();
    render(<Harness initial={Icon.custom(LOGO.id)} />);
    await user.click(screen.getByRole("tab", { name: "Custom" }));
    expect(screen.queryByLabelText("Upload image")).not.toBeInTheDocument();
    expect(screen.queryByText(/Delete this icon/)).not.toBeInTheDocument();
  });

  describe("uploading", () => {
    it("warns that a deleted image can't be loaded again", () => {
      render(<Harness initial={Icon.custom(LOGO.id)} customEditor={editor()} />);
      expect(screen.getByText(/If you delete one, it can't be loaded again/)).toBeInTheDocument();
    });

    it("chooses an uploaded image, handing it over to be saved with the choice", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      iconImageFromFile.mockResolvedValue(new Uint8Array([9]));
      render(<Harness onChange={onChange} customEditor={editor()} />);

      await user.click(screen.getByRole("tab", { name: "Custom" }));
      await user.upload(
        screen.getByLabelText("Upload image"),
        new File(["x"], "bank.logo.png", { type: "image/png" }),
      );

      const [icon, added] = onChange.mock.calls[0] as [Icon, CustomIcon];
      expect(added.name).toBe("bank.logo");
      expect(Array.from(added.data)).toEqual([9]);
      expect(icon.equals(Icon.custom(added.id))).toBe(true);
      expect(screen.getByRole("button", { name: "bank.logo" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // Picking the unsaved upload again still hands it over; a saved icon doesn't.
      await user.click(screen.getByRole("button", { name: "Logo" }));
      await user.click(screen.getByRole("button", { name: "bank.logo" }));
      expect(onChange).toHaveBeenLastCalledWith(Icon.custom(added.id), added);
    });

    it("shows why an image couldn't be added", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      iconImageFromFile.mockRejectedValue(new Error("That file isn't an image Argus can read."));
      render(<Harness onChange={onChange} customEditor={editor()} />);

      await user.click(screen.getByRole("tab", { name: "Custom" }));
      await user.upload(
        screen.getByLabelText("Upload image"),
        new File(["x"], "notes.png", { type: "image/png" }),
      );

      expect(screen.getByText("That file isn't an image Argus can read.")).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("does nothing when the file dialog is closed without a pick", async () => {
      const user = userEvent.setup();
      render(<Harness customEditor={editor()} />);
      await user.click(screen.getByRole("tab", { name: "Custom" }));
      fireEvent.change(screen.getByLabelText("Upload image"), { target: { files: [] } });
      expect(iconImageFromFile).not.toHaveBeenCalled();
    });
  });

  describe("deleting", () => {
    it("asks first, naming what will lose the icon", async () => {
      const user = userEvent.setup();
      const customEditor = editor({ usage: () => 3 });
      render(<Harness initial={Icon.custom(LOGO.id)} customEditor={customEditor} />);

      await user.click(screen.getByRole("button", { name: "Delete this icon from the vault…" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "3 entries and groups use it and will go back to their automatic icons.",
      );
      expect(screen.getByRole("alert")).toHaveTextContent("can't be loaded again");

      await user.click(screen.getByRole("button", { name: "Keep it" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(customEditor.remove).not.toHaveBeenCalled();
    });

    it("words the warning for one user and for none", async () => {
      const user = userEvent.setup();
      const { unmount } = render(
        <Harness initial={Icon.custom(LOGO.id)} customEditor={editor({ usage: () => 1 })} />,
      );
      await user.click(screen.getByRole("button", { name: "Delete this icon from the vault…" }));
      expect(screen.getByRole("alert")).toHaveTextContent("1 entry or group uses it");
      unmount();

      render(<Harness initial={Icon.custom(LOGO.id)} customEditor={editor()} />);
      await user.click(screen.getByRole("button", { name: "Delete this icon from the vault…" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Nothing uses it right now.");
    });

    it("deletes the icon once confirmed", async () => {
      const user = userEvent.setup();
      const customEditor = editor();
      render(<Harness initial={Icon.custom(LOGO.id)} customEditor={customEditor} />);

      await user.click(screen.getByRole("button", { name: "Delete this icon from the vault…" }));
      await user.click(screen.getByRole("button", { name: "Delete icon" }));

      expect(customEditor.remove).toHaveBeenCalledWith(LOGO.id);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("forgets a deleted upload so it isn't offered again", async () => {
      const user = userEvent.setup();
      iconImageFromFile.mockResolvedValue(new Uint8Array([9]));
      let added: CustomIcon | undefined;
      function Saving() {
        // Stands in for the owner: the upload is saved into the vault's icons.
        const [icons, setIcons] = useState(new CustomIcons([LOGO]));
        const customEditor = editor({
          remove: async (id) => setIcons((current) => current.remove(id)),
        });
        return (
          <Harness
            icons={icons}
            customEditor={customEditor}
            onChange={(_, upload) => {
              if (upload) {
                added = upload;
                setIcons((current) => current.add(upload));
              }
            }}
          />
        );
      }
      render(<Saving />);

      await user.click(screen.getByRole("tab", { name: "Custom" }));
      await user.upload(
        screen.getByLabelText("Upload image"),
        new File(["x"], "mine.png", { type: "image/png" }),
      );
      expect(added).toBeDefined();
      await user.click(screen.getByRole("button", { name: "Delete this icon from the vault…" }));
      await user.click(screen.getByRole("button", { name: "Delete icon" }));

      expect(screen.queryByRole("button", { name: "mine" })).not.toBeInTheDocument();
    });

    it("keeps the confirmation open and explains when deleting fails", async () => {
      const user = userEvent.setup();
      const customEditor = editor({ remove: vi.fn().mockRejectedValue(new Error("disk full")) });
      render(<Harness initial={Icon.custom(LOGO.id)} customEditor={customEditor} />);

      await user.click(screen.getByRole("button", { name: "Delete this icon from the vault…" }));
      await user.click(screen.getByRole("button", { name: "Delete icon" }));

      expect(screen.getByText("disk full")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
