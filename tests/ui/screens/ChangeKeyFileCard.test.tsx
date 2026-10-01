import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyFileChange, KeyFileChangeResult } from "../../../src/application/vault-access-service";
import { ChangeKeyFileCard } from "../../../src/ui/screens/ChangeKeyFileCard";

type User = ReturnType<typeof userEvent.setup>;

function renderCard(
  overrides: {
    hasKeyFile?: boolean;
    onPickSaveLocation?: () => Promise<string | undefined>;
    onPickExisting?: () => Promise<string | undefined>;
    onChangeKeyFile?: (password: string, change: KeyFileChange) => Promise<KeyFileChangeResult>;
  } = {},
) {
  const onPickSaveLocation =
    overrides.onPickSaveLocation ?? vi.fn().mockResolvedValue("D:/keys/new.keyx");
  const onPickExisting = overrides.onPickExisting ?? vi.fn().mockResolvedValue("D:/keys/photo.jpg");
  const onChangeKeyFile =
    overrides.onChangeKeyFile ??
    vi.fn().mockResolvedValue({ removedBackups: [], unprotectedBackups: [], keyFilePath: "x" });
  const props = { onPickSaveLocation, onPickExisting, onChangeKeyFile };
  const view = render(<ChangeKeyFileCard hasKeyFile={overrides.hasKeyFile ?? false} {...props} />);
  const rerender = (hasKeyFile: boolean) =>
    view.rerender(<ChangeKeyFileCard hasKeyFile={hasKeyFile} {...props} />);
  return { ...props, rerender };
}

async function reveal(user: User, label = "Add key file") {
  await user.click(screen.getByRole("button", { name: label }));
}

const PASSWORD_LABEL = "Confirm with your master password";

describe("ChangeKeyFileCard", () => {
  it("shows only a button until it's pressed, worded for a vault with no key file", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Add key file" })).toBeInTheDocument();
    expect(screen.getByText(/A file the vault needs as well as its master password/)).toBeVisible();
    expect(screen.queryByLabelText(PASSWORD_LABEL)).not.toBeInTheDocument();
  });

  it("is worded for a vault that already has a key file", () => {
    renderCard({ hasKeyFile: true });

    expect(screen.getByRole("button", { name: "Change key file" })).toBeInTheDocument();
    expect(screen.getByText(/This vault needs its key file/)).toBeInTheDocument();
  });

  it("offers removing the key file only to a vault that has one", async () => {
    const user = userEvent.setup();
    const { rerender } = renderCard();

    await reveal(user);

    expect(screen.getByRole("radio", { name: "Generate new" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Use existing file" })).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: "Remove key file" })).not.toBeInTheDocument();

    rerender(true);

    expect(screen.getByRole("radio", { name: "Remove key file" })).toBeInTheDocument();
  });

  it("asks where to save a generated key file before anything is changed", async () => {
    const user = userEvent.setup();
    const { onChangeKeyFile, onPickSaveLocation } = renderCard();

    await reveal(user);
    await user.click(screen.getByRole("button", { name: "Add key file" }));

    expect(screen.getByText("Choose where to save the key file.")).toBeInTheDocument();
    expect(onChangeKeyFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));

    expect(onPickSaveLocation).toHaveBeenCalledOnce();
    expect(screen.getByText("Saves to: new.keyx")).toBeInTheDocument();
    expect(screen.queryByText("Choose where to save the key file.")).not.toBeInTheDocument();
  });

  it("adds a generated key file, confirming with the master password", async () => {
    const user = userEvent.setup();
    const { onChangeKeyFile } = renderCard();

    await reveal(user);
    await user.type(screen.getByLabelText(PASSWORD_LABEL), "Hunter2-long");
    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));
    await user.click(screen.getByRole("button", { name: "Add key file" }));

    expect(onChangeKeyFile).toHaveBeenCalledExactlyOnceWith("Hunter2-long", {
      kind: "generate",
      path: "D:/keys/new.keyx",
    });
    expect(await screen.findByText("Key file changed.")).toBeInTheDocument();
    expect(
      screen.getByText(/backups were re-encrypted with the new key file too/),
    ).toBeInTheDocument();
    expect(screen.getByText(/still open the way the vault did before/)).toBeInTheDocument();
    // Ready for another change, with nothing left over from this one.
    expect(screen.getByLabelText(PASSWORD_LABEL)).toHaveValue("");
    expect(screen.queryByText("Saves to: new.keyx")).not.toBeInTheDocument();
  });

  it("swaps the key file for an existing file", async () => {
    const user = userEvent.setup();
    const { onChangeKeyFile, onPickExisting } = renderCard({ hasKeyFile: true });

    await reveal(user, "Change key file");
    await user.click(screen.getByRole("radio", { name: "Use existing file" }));
    await user.click(screen.getByRole("button", { name: "Change key file" }));

    expect(screen.getByText("Choose a key file.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose a file…" }));

    expect(onPickExisting).toHaveBeenCalledOnce();
    expect(screen.getByText("Key file: photo.jpg")).toBeInTheDocument();
    expect(screen.getByText(/it must never change/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Choose a different file" })).toBeInTheDocument();
    expect(onChangeKeyFile).not.toHaveBeenCalled();
  });

  it("submits an existing file once one is picked", async () => {
    const user = userEvent.setup();
    const { onChangeKeyFile } = renderCard();

    await reveal(user);
    await user.click(screen.getByRole("radio", { name: "Use existing file" }));
    await user.click(screen.getByRole("button", { name: "Choose a file…" }));
    await user.click(screen.getByRole("button", { name: "Add key file" }));

    expect(onChangeKeyFile).toHaveBeenCalledExactlyOnceWith("", {
      kind: "existing",
      path: "D:/keys/photo.jpg",
    });
  });

  it("lets a picked path be changed, and keeps it when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const onPickSaveLocation = vi
      .fn()
      .mockResolvedValueOnce("D:/keys/first.keyx")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("D:/keys/second.keyx");
    renderCard({ onPickSaveLocation });

    await reveal(user);
    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));
    await user.click(screen.getByRole("button", { name: "Change where the key file is saved" }));

    expect(screen.getByText("Saves to: first.keyx")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change where the key file is saved" }));

    expect(screen.getByText("Saves to: second.keyx")).toBeInTheDocument();
  });

  it("forgets a picked path when switching between generating and an existing file", async () => {
    const user = userEvent.setup();
    renderCard();

    await reveal(user);
    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));
    await user.click(screen.getByRole("radio", { name: "Use existing file" }));

    expect(screen.queryByText(/new\.keyx/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a file…" })).toBeInTheDocument();
  });

  it("removes the key file without asking for a path", async () => {
    const user = userEvent.setup();
    const onChangeKeyFile = vi
      .fn()
      .mockResolvedValue({ removedBackups: [], unprotectedBackups: [], keyFilePath: undefined });
    renderCard({ hasKeyFile: true, onChangeKeyFile });

    await reveal(user, "Change key file");
    await user.type(screen.getByLabelText(PASSWORD_LABEL), "Hunter2-long");
    await user.click(screen.getByRole("radio", { name: "Remove key file" }));

    expect(screen.queryByRole("button", { name: /choose/i })).not.toBeInTheDocument();
    expect(screen.getByText("The vault will open with its master password alone.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove key file" }));

    expect(onChangeKeyFile).toHaveBeenCalledExactlyOnceWith("Hunter2-long", { kind: "remove" });
    expect(await screen.findByText("Key file removed.")).toBeInTheDocument();
    expect(
      screen.getByText(/backups were re-encrypted without the key file too/),
    ).toBeInTheDocument();
  });

  it("shows why the change failed and claims no success", async () => {
    const user = userEvent.setup();
    const onChangeKeyFile = vi.fn().mockRejectedValue(new Error("Current password is incorrect."));
    renderCard({ onChangeKeyFile });

    await reveal(user);
    await user.type(screen.getByLabelText(PASSWORD_LABEL), "wrong");
    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));
    await user.click(screen.getByRole("button", { name: "Add key file" }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(screen.queryByText("Key file changed.")).not.toBeInTheDocument();
    // What was entered stays, to correct and try again.
    expect(screen.getByLabelText(PASSWORD_LABEL)).toHaveValue("wrong");
    expect(screen.getByText("Saves to: new.keyx")).toBeInTheDocument();
  });

  it("falls back to a general message when the failure has none", async () => {
    const user = userEvent.setup();
    renderCard({ onChangeKeyFile: vi.fn().mockRejectedValue(undefined) });

    await reveal(user);
    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));
    await user.click(screen.getByRole("button", { name: "Add key file" }));

    expect(await screen.findByText("Failed to change the key file.")).toBeInTheDocument();
  });

  it("reports backups that couldn't be re-keyed", async () => {
    const user = userEvent.setup();
    const onChangeKeyFile = vi.fn().mockResolvedValue({
      removedBackups: ["C:/v.kdbx.bak1", "C:/v.kdbx.bak2"],
      unprotectedBackups: ["C:/v.kdbx.bak3"],
      keyFilePath: "D:/keys/new.keyx",
    });
    renderCard({ onChangeKeyFile });

    await reveal(user);
    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));
    await user.click(screen.getByRole("button", { name: "Add key file" }));

    expect(
      await screen.findByText(/2 backups couldn't be re-encrypted and were deleted\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Delete them yourself: C:\/v\.kdbx\.bak3/)).toBeInTheDocument();
  });

  it("disables the form while the change is in flight", async () => {
    const user = userEvent.setup();
    let finish: (result: KeyFileChangeResult) => void = () => {};
    const onChangeKeyFile = vi.fn(
      () => new Promise<KeyFileChangeResult>((resolve) => (finish = resolve)),
    );
    renderCard({ onChangeKeyFile });

    await reveal(user);
    await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));
    await user.click(screen.getByRole("button", { name: "Add key file" }));

    expect(screen.getByRole("button", { name: "Re-encrypting…" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Generate new" })).toBeDisabled();

    finish({ removedBackups: [], unprotectedBackups: [], keyFilePath: "D:/keys/new.keyx" });

    expect(await screen.findByText("Key file changed.")).toBeInTheDocument();
  });
});
