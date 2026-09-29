import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewKeyFileChoice, NO_NEW_KEY_FILE } from "../../../src/ui/new-key-file-choice";
import { NewKeyFileOption } from "../../../src/ui/screens/NewKeyFileOption";

function renderOption(
  choice: NewKeyFileChoice,
  overrides: Partial<Parameters<typeof NewKeyFileOption>[0]> = {},
) {
  const props = {
    choice,
    onChange: vi.fn(),
    onPickSaveLocation: vi.fn().mockResolvedValue("D:/keys/new.keyx"),
    onPickExisting: vi.fn().mockResolvedValue("D:/keys/photo.jpg"),
    ...overrides,
  };
  render(<NewKeyFileOption {...props} />);
  return props;
}

describe("NewKeyFileOption", () => {
  it("is off by default and shows nothing else until ticked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderOption(NO_NEW_KEY_FILE);

    expect(screen.getByLabelText("Also protect with a key file")).not.toBeChecked();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Also protect with a key file"));
    expect(onChange).toHaveBeenCalledWith({ enabled: true, kind: "generate" });
  });

  it("offers a save location for a generated key file, with the lock-out warning", async () => {
    const user = userEvent.setup();
    const { onChange } = renderOption({ enabled: true, kind: "generate" });

    expect(screen.getByRole("radio", { name: "Generate new" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(/not next to the vault/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));
    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      kind: "generate",
      path: "D:/keys/new.keyx",
    });
  });

  it("offers to pick an existing file, warning that it must never change", async () => {
    const user = userEvent.setup();
    const { onChange } = renderOption({ enabled: true, kind: "existing" });

    expect(screen.getByText(/must never change/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose a file…" }));
    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      kind: "existing",
      path: "D:/keys/photo.jpg",
    });
  });

  it("drops the picked path when switching between generating and an existing file", async () => {
    const user = userEvent.setup();
    const { onChange } = renderOption({
      enabled: true,
      kind: "generate",
      path: "D:/keys/new.keyx",
    });

    await user.click(screen.getByRole("radio", { name: "Use existing file" }));

    expect(onChange).toHaveBeenCalledWith({ enabled: true, kind: "existing" });
  });

  it.each([
    ["generate", "Saves to", "Change where the key file is saved", "D:/keys/new.keyx"],
    ["existing", "Key file", "Change key file", "D:/keys/photo.jpg"],
  ] as const)(
    "shows the chosen %s file and lets it be changed",
    async (kind, prefix, changeLabel, path) => {
      const user = userEvent.setup();
      const { onChange } = renderOption(
        { enabled: true, kind, path: "D:/old/old.keyx" },
        {
          onPickSaveLocation: vi.fn().mockResolvedValue("D:/keys/new.keyx"),
          onPickExisting: vi.fn().mockResolvedValue("D:/keys/photo.jpg"),
        },
      );

      expect(screen.getByText(`${prefix}: old.keyx`)).toHaveAttribute("title", "D:/old/old.keyx");
      await user.click(screen.getByRole("button", { name: changeLabel }));

      expect(onChange).toHaveBeenCalledWith({ enabled: true, kind, path });
    },
  );

  it("keeps the current choice when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const { onChange } = renderOption(
      { enabled: true, kind: "generate" },
      { onPickSaveLocation: vi.fn().mockResolvedValue(undefined) },
    );

    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables every control while busy", () => {
    renderOption({ enabled: true, kind: "generate", path: "D:/keys/new.keyx" }, { disabled: true });

    expect(screen.getByLabelText("Also protect with a key file")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Generate new" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Change where the key file is saved" }),
    ).toBeDisabled();
  });
});
