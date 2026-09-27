import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Vault } from "../../../src/domain";
import { VaultMergeSource } from "../../../src/application/vault-merge-source";
import { MergeUnlockDialog } from "../../../src/ui/screens/MergeUnlockDialog";

const FILE_PATH = "C:/vaults/other.kdbx";

function renderDialog(overrides: Partial<VaultMergeSource> = {}) {
  const sourceVault = Vault.create("Theirs");
  const mergeSource: VaultMergeSource = {
    pickFile: vi.fn().mockResolvedValue(FILE_PATH),
    openFile: vi.fn().mockResolvedValue(sourceVault),
    ...overrides,
  };
  const onUnlocked = vi.fn();
  const onCancel = vi.fn();
  render(
    <MergeUnlockDialog
      filePath={FILE_PATH}
      mergeSource={mergeSource}
      onUnlocked={onUnlocked}
      onCancel={onCancel}
    />,
  );
  return { mergeSource, onUnlocked, onCancel, sourceVault };
}

describe("MergeUnlockDialog", () => {
  it("names the already-picked file and asks only for its master password", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: /merge another vault in/i })).toBeInTheDocument();
    expect(screen.getByText("other.kdbx")).toBeInTheDocument();
    expect(screen.getByLabelText("Its master password")).toBeInTheDocument();
  });

  it("opens the picked file with the typed password and hands the vault over", async () => {
    const user = userEvent.setup();
    const { mergeSource, onUnlocked, sourceVault } = renderDialog();

    await user.type(screen.getByLabelText("Its master password"), "hunter2");
    await user.click(screen.getByRole("button", { name: /unlock & compare/i }));

    expect(mergeSource.openFile).toHaveBeenCalledWith(FILE_PATH, "hunter2");
    await vi.waitFor(() => expect(onUnlocked).toHaveBeenCalledWith(sourceVault));
  });

  it("reports a failure to open the file and stays open", async () => {
    const user = userEvent.setup();
    const { onUnlocked } = renderDialog({
      openFile: vi.fn().mockRejectedValue(new Error("Invalid key")),
    });

    await user.type(screen.getByLabelText("Its master password"), "wrong");
    await user.click(screen.getByRole("button", { name: /unlock & compare/i }));

    expect(await screen.findByText("Invalid key")).toBeInTheDocument();
    expect(screen.getByLabelText("Its master password")).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the failure carries none", async () => {
    const user = userEvent.setup();
    renderDialog({ openFile: vi.fn().mockRejectedValue(undefined) });

    await user.click(screen.getByRole("button", { name: /unlock & compare/i }));

    expect(await screen.findByText("Failed to open vault.")).toBeInTheDocument();
  });

  it("cancels without opening anything", async () => {
    const user = userEvent.setup();
    const { mergeSource, onCancel } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(mergeSource.openFile).not.toHaveBeenCalled();
  });
});
