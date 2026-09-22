import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangeMasterPasswordCard } from "./ChangeMasterPasswordCard";

describe("ChangeMasterPasswordCard", () => {
  it("validates the current password is required", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("Current password is required.")).toBeInTheDocument();
    expect(onChangeMasterPassword).not.toHaveBeenCalled();
  });

  it("validates the new password is required", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("New password is required.")).toBeInTheDocument();
    expect(onChangeMasterPassword).not.toHaveBeenCalled();
  });

  it("validates the new passwords match", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn();
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "new-pw");
    await user.type(screen.getByLabelText("Confirm new password"), "different");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("New passwords do not match.")).toBeInTheDocument();
    expect(onChangeMasterPassword).not.toHaveBeenCalled();
  });

  it("submits the current and new password, clears the form, and shows a success message", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn().mockResolvedValue(undefined);
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "new-pw");
    await user.type(screen.getByLabelText("Confirm new password"), "new-pw");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(onChangeMasterPassword).toHaveBeenCalledWith("old-pw", "new-pw");
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

    await user.type(screen.getByLabelText("Current password"), "wrong-pw");
    await user.type(screen.getByLabelText("New password"), "new-pw");
    await user.type(screen.getByLabelText("Confirm new password"), "new-pw");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("wrong-pw");
  });

  it("falls back to a generic message when a non-Error is thrown", async () => {
    const user = userEvent.setup();
    const onChangeMasterPassword = vi.fn().mockRejectedValue("boom");
    render(<ChangeMasterPasswordCard onChangeMasterPassword={onChangeMasterPassword} />);

    await user.type(screen.getByLabelText("Current password"), "old-pw");
    await user.type(screen.getByLabelText("New password"), "new-pw");
    await user.type(screen.getByLabelText("Confirm new password"), "new-pw");
    await user.click(screen.getByRole("button", { name: /change master password/i }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
