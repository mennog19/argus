import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangeMasterPasswordCard } from "../../../src/ui/screens/ChangeMasterPasswordCard";

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

  it("rejects a new password shorter than 12 characters", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "elevenchars");
    await user.type(screen.getByLabelText("Confirm new password"), "elevenchars");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(
      await screen.findByText("New password must be at least 12 characters."),
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
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "different");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("New passwords do not match.")).toBeInTheDocument();
    expect(onChangeMasterPassword).not.toHaveBeenCalled();
  });

  it("submits the current and new password, clears the form, and shows a success message", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn().mockResolvedValue(undefined);
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-password");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(onChangeMasterPassword).toHaveBeenCalledWith("old-pw", "new-password");
    expect(await screen.findByText("Master password changed.")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  });

  it("shows the error message when changing the password fails", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi
      .fn()
      .mockRejectedValue(new Error("Current password is incorrect."));
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await reveal(user);
    await user.type(screen.getByLabelText("Current password"), "wrong-pw");
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-password");
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
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-password");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
