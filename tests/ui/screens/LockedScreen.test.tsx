import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Vault } from "../../../src/domain";
import { VaultAccessService } from "../../../src/application/vault-access-service";
import { LockedScreen } from "../../../src/ui/screens/LockedScreen";

function fakeService(overrides: Partial<VaultAccessService> = {}): VaultAccessService {
  return {
    openExistingVault: vi.fn(),
    createNewVault: vi.fn(),
    openVaultAtPath: vi.fn(),
    ...overrides,
  } as unknown as VaultAccessService;
}

describe("LockedScreen", () => {
  it("shows the vault's file name", () => {
    render(
      <LockedScreen
        filePath="C:/vaults/personal.kdbx"
        vaultAccessService={fakeService()}
        onUnlocked={vi.fn()}
        onChooseDifferentVault={vi.fn()}
      />,
    );

    expect(screen.getByText("personal.kdbx")).toBeInTheDocument();
  });

  it("unlocks via the Unlock button and calls onUnlocked", async () => {
    const user = userEvent.setup();
    const vault = Vault.create("Mine");
    const onUnlocked = vi.fn();
    const service = fakeService({ openVaultAtPath: vi.fn().mockResolvedValue(vault) });

    render(
      <LockedScreen
        filePath="C:/vaults/personal.kdbx"
        vaultAccessService={service}
        onUnlocked={onUnlocked}
        onChooseDifferentVault={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Master password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(service.openVaultAtPath).toHaveBeenCalledWith("C:/vaults/personal.kdbx", "hunter2");
    expect(onUnlocked).toHaveBeenCalledWith(vault);
  });

  it("unlocks when Enter is pressed in the password field", async () => {
    const user = userEvent.setup();
    const vault = Vault.create("Mine");
    const onUnlocked = vi.fn();
    const service = fakeService({ openVaultAtPath: vi.fn().mockResolvedValue(vault) });

    render(
      <LockedScreen
        filePath="C:/vaults/personal.kdbx"
        vaultAccessService={service}
        onUnlocked={onUnlocked}
        onChooseDifferentVault={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Master password"), "hunter2{Enter}");

    expect(onUnlocked).toHaveBeenCalledWith(vault);
  });

  it("does not unlock on other key presses", async () => {
    const user = userEvent.setup();
    const service = fakeService();

    render(
      <LockedScreen
        filePath="C:/vaults/personal.kdbx"
        vaultAccessService={service}
        onUnlocked={vi.fn()}
        onChooseDifferentVault={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Master password"), "a");

    expect(service.openVaultAtPath).not.toHaveBeenCalled();
  });

  it("toggles the password field between hidden and revealed", async () => {
    const user = userEvent.setup();
    render(
      <LockedScreen
        filePath="C:/vaults/personal.kdbx"
        vaultAccessService={fakeService()}
        onUnlocked={vi.fn()}
        onChooseDifferentVault={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Master password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("shows the error message when unlocking fails", async () => {
    const user = userEvent.setup();
    const service = fakeService({
      openVaultAtPath: vi.fn().mockRejectedValue(new Error("Invalid credentials")),
    });

    render(
      <LockedScreen
        filePath="C:/vaults/personal.kdbx"
        vaultAccessService={service}
        onUnlocked={vi.fn()}
        onChooseDifferentVault={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });

  it("falls back to a generic message when a non-Error is thrown", async () => {
    const user = userEvent.setup();
    const service = fakeService({ openVaultAtPath: vi.fn().mockRejectedValue("boom") });

    render(
      <LockedScreen
        filePath="C:/vaults/personal.kdbx"
        vaultAccessService={service}
        onUnlocked={vi.fn()}
        onChooseDifferentVault={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("calls onChooseDifferentVault when the link is clicked", async () => {
    const user = userEvent.setup();
    const onChooseDifferentVault = vi.fn();

    render(
      <LockedScreen
        filePath="C:/vaults/personal.kdbx"
        vaultAccessService={fakeService()}
        onUnlocked={vi.fn()}
        onChooseDifferentVault={onChooseDifferentVault}
      />,
    );

    await user.click(screen.getByRole("button", { name: /choose a different vault/i }));

    expect(onChooseDifferentVault).toHaveBeenCalled();
  });
});
