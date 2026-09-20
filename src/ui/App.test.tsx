import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Vault } from "../domain";
import { OpenedVault, VaultAccessService } from "../application/vault-access-service";
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from "../application/settings";
import { UrlOpener } from "../application/url-opener";
import App from "./App";

function fakeVaultAccessService(overrides: Partial<VaultAccessService> = {}): VaultAccessService {
  return {
    openExistingVault: vi.fn(),
    createNewVault: vi.fn(),
    openVaultAtPath: vi.fn(),
    saveVault: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as VaultAccessService;
}

function fakeSettingsStore(overrides: Partial<SettingsStore> = {}): SettingsStore {
  return {
    load: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeUrlOpener(): UrlOpener {
  return { open: vi.fn() };
}

describe("App", () => {
  it("shows the welcome screen when there are no recent vaults", async () => {
    render(
      <App
        vaultAccessService={fakeVaultAccessService()}
        settingsStore={fakeSettingsStore()}
        urlOpener={fakeUrlOpener()}
      />,
    );

    expect(await screen.findByRole("button", { name: /open existing vault/i })).toBeInTheDocument();
  });

  it("falls back to the welcome screen when loading settings fails", async () => {
    render(
      <App
        vaultAccessService={fakeVaultAccessService()}
        settingsStore={fakeSettingsStore({ load: vi.fn().mockRejectedValue(new Error("no backend")) })}
        urlOpener={fakeUrlOpener()}
      />,
    );

    expect(await screen.findByRole("button", { name: /open existing vault/i })).toBeInTheDocument();
  });

  it("goes straight to the locked screen for the most recently opened vault", async () => {
    const settings: AppSettings = {
      recentVaults: [
        { path: "C:/vaults/b.kdbx", lastOpenedAt: "2026-01-02T00:00:00.000Z" },
        { path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };

    render(
      <App
        vaultAccessService={fakeVaultAccessService()}
        settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
        urlOpener={fakeUrlOpener()}
      />,
    );

    expect(await screen.findByText("b.kdbx")).toBeInTheDocument();
  });

  it("unlocks from the welcome screen (create flow), then locking returns to the locked screen for that vault", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = { vault: Vault.create("Personal"), filePath: "C:/vaults/personal.kdbx" };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({ createNewVault: vi.fn().mockResolvedValue(opened) })}
        settingsStore={settingsStore}
        urlOpener={fakeUrlOpener()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();
    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ recentVaults: [expect.objectContaining({ path: "C:/vaults/personal.kdbx" })] }),
    );

    await user.click(screen.getByRole("button", { name: "Lock vault" }));

    expect(await screen.findByText("personal.kdbx")).toBeInTheDocument();
  });

  it("unlocks from the locked screen", async () => {
    const user = userEvent.setup();
    const settings: AppSettings = {
      recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
    };
    const vault = Vault.create("A");

    render(
      <App
        vaultAccessService={fakeVaultAccessService({ openVaultAtPath: vi.fn().mockResolvedValue(vault) })}
        settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
        urlOpener={fakeUrlOpener()}
      />,
    );

    await user.type(await screen.findByLabelText("Master password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();
  });

  it("lets the user pick a different recent vault from the welcome screen", async () => {
    const user = userEvent.setup();
    const settings: AppSettings = {
      recentVaults: [
        { path: "C:/vaults/b.kdbx", lastOpenedAt: "2026-01-02T00:00:00.000Z" },
        { path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };

    render(
      <App
        vaultAccessService={fakeVaultAccessService()}
        settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
        urlOpener={fakeUrlOpener()}
      />,
    );

    // Starts locked on the most recent vault (b.kdbx); choose a different one.
    await screen.findByText("b.kdbx");
    await user.click(screen.getByRole("button", { name: /choose a different vault/i }));
    await user.click(await screen.findByText("a.kdbx"));

    expect(await screen.findByText("a.kdbx")).toBeInTheDocument();
    expect(screen.getByLabelText("Master password")).toBeInTheDocument();
  });

  it("keeps the vault unlocked even if persisting recent-vault settings fails", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = { vault: Vault.create("Personal"), filePath: "C:/vaults/personal.kdbx" };
    const settingsStore = fakeSettingsStore({ save: vi.fn().mockRejectedValue(new Error("disk full")) });

    render(
      <App
        vaultAccessService={fakeVaultAccessService({ createNewVault: vi.fn().mockResolvedValue(opened) })}
        settingsStore={settingsStore}
        urlOpener={fakeUrlOpener()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();
  });

  it("persists an entry created in the vault shell via saveVault, keeping the vault unlocked", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = { vault: Vault.create("Personal"), filePath: "C:/vaults/personal.kdbx" };
    const saveVault = vi.fn().mockResolvedValue(undefined);

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
          saveVault,
        })}
        settingsStore={fakeSettingsStore()}
        urlOpener={fakeUrlOpener()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: /new entry/i }));
    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "GitHub" })).toBeInTheDocument();
    expect(saveVault).toHaveBeenCalledWith(expect.anything(), "C:/vaults/personal.kdbx");
  });

  it("persists a generator policy change made in the vault shell's generator screen", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = { vault: Vault.create("Personal"), filePath: "C:/vaults/personal.kdbx" };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({ createNewVault: vi.fn().mockResolvedValue(opened) })}
        settingsStore={settingsStore}
        urlOpener={fakeUrlOpener()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Password generator" }));
    await user.click(screen.getByRole("button", { name: "Passphrase" }));

    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ generatorPolicy: expect.objectContaining({ mode: "passphrase" }) }),
    );
  });

  it("keeps the generator policy change even if persisting it fails", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = { vault: Vault.create("Personal"), filePath: "C:/vaults/personal.kdbx" };
    const settingsStore = fakeSettingsStore({ save: vi.fn().mockRejectedValue(new Error("disk full")) });

    render(
      <App
        vaultAccessService={fakeVaultAccessService({ createNewVault: vi.fn().mockResolvedValue(opened) })}
        settingsStore={settingsStore}
        urlOpener={fakeUrlOpener()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Password generator" }));
    await user.click(screen.getByRole("button", { name: "Passphrase" }));

    expect(await screen.findByRole("heading", { name: "Password Generator" })).toBeInTheDocument();
  });
});
