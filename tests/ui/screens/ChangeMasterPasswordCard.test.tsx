import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangeMasterPasswordCard } from "../../../src/ui/screens/ChangeMasterPasswordCard";

const NOTHING_LEFT_BEHIND = { removedBackups: [], unprotectedBackups: [] };

async function reveal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /change master password/i }));
}

describe("ChangeMasterPasswordCard", () => {
  it("shows only a button and hides the form until it's pressed", () => {
    render(<ChangeMasterPasswordCard onChangeMasterPassword={vi.fn()} />);

    expect(screen.getByRole("button", { name: /change master password/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm new password")).not.toBeInTheDocument();
  });

  it("reveals the form once the button is pressed, with no way to collapse it again", async () => {
    const user = userEvent.setup();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={vi.fn()} />);

    await reveal(user);

    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("validates the current password is required", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("Current password is required.")).toBeInTheDocument();
    expect(onChangeMasterPassword).not.toHaveBeenCalled();
  });

  it("validates the new password is required", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("New password is required.")).toBeInTheDocument();
    expect(onChangeMasterPassword).not.toHaveBeenCalled();
  });

  it("rejects a new password missing a capital, a number, or a symbol, saying which", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "all-lowercase");
    await user.type(screen.getByLabelText("Confirm new password"), "all-lowercase");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(
      await screen.findByText("New password needs a capital letter and a number."),
    ).toBeInTheDocument();
    expect(onChangeMasterPassword).not.toHaveBeenCalled();
  });

  it("shows the strength of the new password as it is typed", async () => {
    const user = userEvent.setup();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={vi.fn()} />);

    await reveal(user);
    await user.type(screen.getByLabelText("New password"), "Correct-Horse-Battery-9");

    expect(screen.getByText("Strong")).toBeInTheDocument();
  });

  it("validates the new passwords match", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "New-password1");
    await user.type(screen.getByLabelText("Confirm new password"), "different");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("New passwords do not match.")).toBeInTheDocument();
    expect(onChangeMasterPassword).not.toHaveBeenCalled();
  });

  it.each(["New password", "Confirm new password"])(
    "clears the mismatch error when the %s field is edited",
    async (label) => {
      const user = userEvent.setup();
      render(<ChangeMasterPasswordCard onChangeMasterPassword={vi.fn()} />);

      await reveal(user);
      await user.type(screen.getByLabelText("Current password"), "old-pw");
      await user.type(screen.getByLabelText("New password"), "New-password1");
      await user.type(screen.getByLabelText("Confirm new password"), "different");
      await user.click(screen.getByRole("button", { name: /change master password/i }));
      expect(await screen.findByText("New passwords do not match.")).toBeInTheDocument();

      await user.type(screen.getByLabelText(label), "x");

      expect(screen.queryByText("New passwords do not match.")).not.toBeInTheDocument();
    },
  );

  it("submits the current and new password, clears the form, and shows a success message", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn().mockResolvedValue(NOTHING_LEFT_BEHIND);
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "New-password1");
    await user.type(screen.getByLabelText("Confirm new password"), "New-password1");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(onChangeMasterPassword).toHaveBeenCalledWith("old-pw", "New-password1");
    expect(await screen.findByText("Master password changed.")).toBeInTheDocument();
    expect(screen.getByText(/backups were re-encrypted/i)).toBeInTheDocument();
    expect(screen.getByText(/copies made outside Argus/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  });

  it("says which backups were deleted or still need deleting by hand", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn().mockResolvedValue({
      removedBackups: ["C:/vaults/mine.kdbx.bak2", "C:/vaults/mine.kdbx.bak3"],
      unprotectedBackups: ["C:/vaults/mine.kdbx.bak1"],
    });
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "New-password1");
    await user.type(screen.getByLabelText("Confirm new password"), "New-password1");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText(/2 backups couldn't be re-encrypted/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Delete them yourself: C:\/vaults\/mine\.kdbx\.bak1/),
    ).toBeInTheDocument();
  });

  it("uses the singular when only one backup was deleted", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn().mockResolvedValue({
      removedBackups: ["C:/vaults/mine.kdbx.bak3"],
      unprotectedBackups: [],
    });
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "New-password1");
    await user.type(screen.getByLabelText("Confirm new password"), "New-password1");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(
      await screen.findByText(/1 backup couldn't be re-encrypted and was deleted\./i),
    ).toBeInTheDocument();
  });

  it("shows the error message when changing the password fails", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi
      .fn()
      .mockRejectedValue(new Error("Current password is incorrect."));
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "wrong-pw");
    await user.type(screen.getByLabelText("New password"), "New-password1");
    await user.type(screen.getByLabelText("Confirm new password"), "New-password1");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("wrong-pw");
  });

  it("falls back to a generic message when a non-Error is thrown", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn().mockRejectedValue("boom");
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "New-password1");
    await user.type(screen.getByLabelText("Confirm new password"), "New-password1");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
