import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomIcon, CustomIcons, Entry, Icon } from "../../../src/domain";
import { DEFAULT_ENTRY_FIELD_VISIBILITY } from "../../../src/application/settings";
import { CustomIconsContext } from "../../../src/ui/entry-icons/custom-icons-context";
import { EntryForm } from "../../../src/ui/screens/EntryForm";

const { iconImageFromFile } = vi.hoisted(() => ({ iconImageFromFile: vi.fn() }));
vi.mock("../../../src/ui/entry-icons/custom-icon-image", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  iconImageFromFile,
}));

const LOGO = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000abcd", new Uint8Array([1]), "Logo");
const editor = { remove: vi.fn().mockResolvedValue(undefined), usage: () => 0 };

function renderForm(icons: CustomIcons, initialEntry?: Entry) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const form = (library: CustomIcons) => (
    <CustomIconsContext value={{ icons: library, editor }}>
      <EntryForm
        initialEntry={initialEntry}
        initialGroupId="root-id"
        groupOptions={[{ id: "root-id", label: "My Vault" }]}
        generatorPolicy={{}}
        fieldVisibility={DEFAULT_ENTRY_FIELD_VISIBILITY}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    </CustomIconsContext>
  );
  const { rerender } = render(form(icons));
  return { onSubmit, setIcons: (library: CustomIcons) => rerender(form(library)) };
}

beforeEach(() => {
  iconImageFromFile.mockReset().mockResolvedValue(new Uint8Array([9]));
});

describe("EntryForm custom icons", () => {
  it("saves only the upload the entry ends up using", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(new CustomIcons([LOGO]));

    await user.type(screen.getByLabelText("Title"), "Bank");
    await user.click(screen.getByRole("button", { name: "Change icon" }));
    await user.click(screen.getByRole("tab", { name: "Custom" }));
    const input = screen.getByLabelText("Upload image");
    await user.upload(input, new File(["a"], "first.png", { type: "image/png" }));
    await user.upload(input, new File(["b"], "second.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "first" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry, , added] = onSubmit.mock.calls[0] as [Entry, unknown, CustomIcon];
    expect(added.name).toBe("first");
    expect(entry.icon.equals(Icon.custom(added.id))).toBe(true);
  });

  it("hands over nothing extra when a saved icon is chosen", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(new CustomIcons([LOGO]));

    await user.type(screen.getByLabelText("Title"), "Bank");
    await user.click(screen.getByRole("button", { name: "Change icon" }));
    await user.click(screen.getByRole("tab", { name: "Custom" }));
    await user.click(screen.getByRole("button", { name: "Logo" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry, , added] = onSubmit.mock.calls[0] as [Entry, unknown, CustomIcon | undefined];
    expect(entry.icon.equals(Icon.custom(LOGO.id))).toBe(true);
    expect(added).toBeUndefined();
  });

  it("falls back to automatic when the chosen icon was deleted while editing", async () => {
    const user = userEvent.setup();
    const { onSubmit, setIcons } = renderForm(new CustomIcons([LOGO]));

    await user.type(screen.getByLabelText("Title"), "Bank");
    await user.click(screen.getByRole("button", { name: "Change icon" }));
    await user.click(screen.getByRole("tab", { name: "Custom" }));
    await user.click(screen.getByRole("button", { name: "Logo" }));
    setIcons(CustomIcons.EMPTY);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect((onSubmit.mock.calls[0][0] as Entry).icon).toBe(Icon.AUTO);
  });

  it("keeps an entry's own icon untouched even when the image is missing", async () => {
    const user = userEvent.setup();
    const existing = Entry.create({ title: "Bank", icon: Icon.custom(LOGO.id) });
    const { onSubmit } = renderForm(CustomIcons.EMPTY, existing);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect((onSubmit.mock.calls[0][0] as Entry).icon.equals(Icon.custom(LOGO.id))).toBe(true);
  });
});
