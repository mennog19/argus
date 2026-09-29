import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, Vault } from "../../src/domain";
import { ClipboardWriter } from "../../src/application/clipboard";
import {
  OpenedVault,
  VaultAccessService,
  VaultSaveConflictError,
} from "../../src/application/vault-access-service";
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from "../../src/application/settings";
import { SettingsTransferService } from "../../src/application/settings-transfer-service";
import { UrlOpener } from "../../src/application/url-opener";
import { WindowEvents } from "../../src/application/window-events";
import { WindowProtection } from "../../src/application/window-protection";
import { VaultMergeSource } from "../../src/application/vault-merge-source";
import { AutoTyper, GlobalHotkey } from "../../src/application/auto-type";
import { AutoTypeService } from "../../src/application/auto-type-service";
import App from "../../src/ui/App";

function fakeVaultAccessService(overrides: Partial<VaultAccessService> = {}): VaultAccessService {
  return {
    openExistingVault: vi.fn(),
    createNewVault: vi.fn(),
    openVaultAtPath: vi.fn(),
    saveVault: vi.fn().mockResolvedValue(undefined),
    changeMasterPassword: vi.fn().mockResolvedValue(undefined),
    getFileInfo: vi.fn().mockResolvedValue({ sizeBytes: 0, lastModifiedMs: 0 }),
    closeVault: vi.fn(),
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

function fakeSettingsTransferService(
  overrides: Partial<SettingsTransferService> = {},
): SettingsTransferService {
  return {
    exportSettings: vi.fn().mockResolvedValue(undefined),
    importSettings: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SettingsTransferService;
}

function fakeUrlOpener(): UrlOpener {
  return { open: vi.fn() };
}

function fakeClipboardWriter(): ClipboardWriter {
  return { writeText: vi.fn(), clearIfUnchanged: vi.fn() };
}

function fakeWindowEvents(overrides: Partial<WindowEvents> = {}): WindowEvents {
  return { onMinimize: vi.fn().mockReturnValue(vi.fn()), ...overrides };
}

function fakeWindowProtection(overrides: Partial<WindowProtection> = {}): WindowProtection {
  return { setContentProtected: vi.fn().mockResolvedValue(undefined), ...overrides };
}

function fakeMergeSource(overrides: Partial<VaultMergeSource> = {}): VaultMergeSource {
  return { pickFile: vi.fn(), openFile: vi.fn(), ...overrides };
}

function fakeAutoTyper(overrides: Partial<AutoTyper> = {}): AutoTyper {
  return {
    captureTarget: vi.fn().mockResolvedValue(undefined),
    inspectTarget: vi.fn().mockResolvedValue({ hasUsernameField: true, hasPasswordField: true }),
    typeIntoTarget: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeAutoTypeService(autoTyper: AutoTyper = fakeAutoTyper()): AutoTypeService {
  return new AutoTypeService(autoTyper);
}

function fakeGlobalHotkey(overrides: Partial<GlobalHotkey> = {}): GlobalHotkey {
  return {
    register: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("App", () => {
  it("shows the welcome screen when there are no recent vaults", async () => {
    render(
      <App
        vaultAccessService={fakeVaultAccessService()}
        settingsStore={fakeSettingsStore()}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    expect(await screen.findByRole("button", { name: /open existing vault/i })).toBeInTheDocument();
  });

  it("falls back to the welcome screen when loading settings fails", async () => {
    render(
      <App
        vaultAccessService={fakeVaultAccessService()}
        settingsStore={fakeSettingsStore({
          load: vi.fn().mockRejectedValue(new Error("no backend")),
        })}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
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
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    expect(await screen.findByText("b.kdbx")).toBeInTheDocument();
  });

  it("unlocks from the welcome screen (create flow), then locking returns to the locked screen for that vault", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore();
    const vaultAccessService = fakeVaultAccessService({
      createNewVault: vi.fn().mockResolvedValue(opened),
    });

    render(
      <App
        vaultAccessService={vaultAccessService}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();
    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        recentVaults: [expect.objectContaining({ path: "C:/vaults/personal.kdbx" })],
      }),
    );

    expect(vaultAccessService.closeVault).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Lock vault" }));

    expect(await screen.findByText("personal.kdbx")).toBeInTheDocument();
    // Locking has to drop the decrypted document, not just hide it.
    expect(vaultAccessService.closeVault).toHaveBeenCalled();
  });

  it("unlocks from the locked screen", async () => {
    const user = userEvent.setup();
    const settings: AppSettings = {
      recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
    };
    const vault = Vault.create("A");

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          openVaultAtPath: vi.fn().mockResolvedValue(vault),
        })}
        settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.type(await screen.findByLabelText("Master password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();
  });

  it("keeps working when the vault's file info can't be loaded after unlocking", async () => {
    const user = userEvent.setup();
    const settings: AppSettings = {
      recentVaults: [{ path: "C:/vaults/a.kdbx", lastOpenedAt: "2026-01-01T00:00:00.000Z" }],
    };
    const vault = Vault.create("A");

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          openVaultAtPath: vi.fn().mockResolvedValue(vault),
          getFileInfo: vi.fn().mockRejectedValue(new Error("stat failed")),
        })}
        settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.type(await screen.findByLabelText("Master password"), "hunter2-long");
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
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
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
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore({
      save: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();
  });

  it("persists an entry created in the vault shell via saveVault, keeping the vault unlocked", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const saveVault = vi.fn().mockResolvedValue(undefined);

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
          saveVault,
        })}
        settingsStore={fakeSettingsStore()}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: /new entry/i }));
    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "GitHub" })).toBeInTheDocument();
    expect(saveVault).toHaveBeenCalledWith(expect.anything(), "C:/vaults/personal.kdbx");
  });

  describe("changing the master password", () => {
    async function createVaultAndOpenSettings(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole("button", { name: /create new vault/i }));
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      await user.click(await screen.findByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("button", { name: /change master password/i }));
    }

    it("changes the master password through the vault access service", async () => {
      const user = userEvent.setup({ delay: null });
      const opened: OpenedVault = {
        vault: Vault.create("Personal"),
        filePath: "C:/vaults/personal.kdbx",
      };
      const changeMasterPassword = vi.fn().mockResolvedValue(undefined);

      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
            changeMasterPassword,
          })}
          settingsStore={fakeSettingsStore()}
          settingsTransferService={fakeSettingsTransferService()}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService()}
          globalHotkey={fakeGlobalHotkey()}
        />,
      );

      await createVaultAndOpenSettings(user);
      await user.type(screen.getByLabelText("Current password"), "hunter2-long");
      await user.type(screen.getByLabelText("New password"), "hunter3-long");
      await user.type(screen.getByLabelText("Confirm new password"), "hunter3-long");
      await user.click(screen.getByRole("button", { name: /change master password/i }));

      expect(changeMasterPassword).toHaveBeenCalledWith(
        expect.anything(),
        "C:/vaults/personal.kdbx",
        "hunter2-long",
        "hunter3-long",
      );
      expect(await screen.findByText("Master password changed.")).toBeInTheDocument();
    });

    it("does not report the password as changed when the save conflicted", async () => {
      const user = userEvent.setup({ delay: null });
      const opened: OpenedVault = {
        vault: Vault.create("Personal"),
        filePath: "C:/vaults/personal.kdbx",
      };
      const changeMasterPassword = vi
        .fn()
        .mockRejectedValue(new VaultSaveConflictError(opened.filePath));

      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
            changeMasterPassword,
          })}
          settingsStore={fakeSettingsStore()}
          settingsTransferService={fakeSettingsTransferService()}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService()}
          globalHotkey={fakeGlobalHotkey()}
        />,
      );

      await createVaultAndOpenSettings(user);
      await user.type(screen.getByLabelText("Current password"), "hunter2-long");
      await user.type(screen.getByLabelText("New password"), "hunter3-long");
      await user.type(screen.getByLabelText("Confirm new password"), "hunter3-long");
      await user.click(screen.getByRole("button", { name: /change master password/i }));

      // Nothing reached the file, so the card must not claim otherwise —
      // the user would be left believing a password that doesn't open it.
      expect(await screen.findByText(/nothing was saved/i)).toBeInTheDocument();
      expect(screen.queryByText("Master password changed.")).not.toBeInTheDocument();
      expect(
        await screen.findByRole("heading", { name: /vault changed on disk/i }),
      ).toBeInTheDocument();
    });

    it("shows the error message inline when the current password is incorrect", async () => {
      const user = userEvent.setup({ delay: null });
      const opened: OpenedVault = {
        vault: Vault.create("Personal"),
        filePath: "C:/vaults/personal.kdbx",
      };
      const changeMasterPassword = vi
        .fn()
        .mockRejectedValue(new Error("Current password is incorrect."));

      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
            changeMasterPassword,
          })}
          settingsStore={fakeSettingsStore()}
          settingsTransferService={fakeSettingsTransferService()}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService()}
          globalHotkey={fakeGlobalHotkey()}
        />,
      );

      await createVaultAndOpenSettings(user);
      await user.type(screen.getByLabelText("Current password"), "wrong");
      await user.type(screen.getByLabelText("New password"), "hunter3-long");
      await user.type(screen.getByLabelText("Confirm new password"), "hunter3-long");
      await user.click(screen.getByRole("button", { name: /change master password/i }));

      expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: /vault changed on disk/i }),
      ).not.toBeInTheDocument();
    });

    it("shows the conflict overlay when the file changed on disk since it was opened", async () => {
      const user = userEvent.setup({ delay: null });
      const opened: OpenedVault = {
        vault: Vault.create("Personal"),
        filePath: "C:/vaults/personal.kdbx",
      };
      const changeMasterPassword = vi
        .fn()
        .mockRejectedValue(new VaultSaveConflictError(opened.filePath));

      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
            changeMasterPassword,
          })}
          settingsStore={fakeSettingsStore()}
          settingsTransferService={fakeSettingsTransferService()}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService()}
          globalHotkey={fakeGlobalHotkey()}
        />,
      );

      await createVaultAndOpenSettings(user);
      await user.type(screen.getByLabelText("Current password"), "hunter2-long");
      await user.type(screen.getByLabelText("New password"), "hunter3-long");
      await user.type(screen.getByLabelText("Confirm new password"), "hunter3-long");
      await user.click(screen.getByRole("button", { name: /change master password/i }));

      expect(
        await screen.findByRole("heading", { name: /vault changed on disk/i }),
      ).toBeInTheDocument();
    });
  });

  it("persists a generator policy change made in the vault shell's generator screen", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Password generator" }));
    await user.click(screen.getByRole("button", { name: "Passphrase" }));

    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ generatorPolicy: expect.objectContaining({ mode: "passphrase" }) }),
    );
  });

  it("persists a clipboard clear-delay change made in the vault shell's settings screen", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText(/clear clipboard after/i), { target: { value: "45" } });

    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ clipboardClearSeconds: 45 }),
    );
  });

  it("keeps the generator policy change even if persisting it fails", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore({
      save: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Password generator" }));
    await user.click(screen.getByRole("button", { name: "Passphrase" }));

    expect(await screen.findByRole("heading", { name: "Password Generator" })).toBeInTheDocument();
  });

  it("propagates a non-conflict save error so the entry form can show it, without opening the conflict overlay", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const saveVault = vi.fn().mockRejectedValueOnce(new Error("disk full"));

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
          saveVault,
        })}
        settingsStore={fakeSettingsStore()}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: /new entry/i }));
    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("disk full")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /vault changed on disk/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a conflict overlay instead of losing the edit when the file changed on disk", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const saveVault = vi.fn().mockRejectedValueOnce(new VaultSaveConflictError(opened.filePath));

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
          saveVault,
        })}
        settingsStore={fakeSettingsStore()}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: /new entry/i }));
    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("heading", { name: /vault changed on disk/i }),
    ).toBeInTheDocument();
  });

  it("retries the save with force when the user chooses to overwrite the conflict", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const saveVault = vi
      .fn()
      .mockRejectedValueOnce(new VaultSaveConflictError(opened.filePath))
      .mockResolvedValueOnce(undefined);

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
          saveVault,
        })}
        settingsStore={fakeSettingsStore()}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: /new entry/i }));
    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Nothing was written, so the form says so and stays open rather than
    // closing as though the entry had been saved.
    expect(await screen.findByText(/nothing was saved/i)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /overwrite anyway/i }));

    expect(saveVault).toHaveBeenLastCalledWith(expect.anything(), opened.filePath, { force: true });
    expect(await screen.findByRole("button", { name: /GitHub/ })).toBeInTheDocument();
  });

  it("locks the vault, discarding the pending edit, when the user chooses to discard the conflict", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const saveVault = vi.fn().mockRejectedValueOnce(new VaultSaveConflictError(opened.filePath));

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
          saveVault,
        })}
        settingsStore={fakeSettingsStore()}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: /new entry/i }));
    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(await screen.findByRole("button", { name: /discard my changes/i }));

    expect(await screen.findByLabelText("Master password")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /vault changed on disk/i }),
    ).not.toBeInTheDocument();
  });

  it("persists an auto-lock change made in the vault shell's settings screen", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("checkbox", { name: /minimized/i }));

    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ autoLock: expect.objectContaining({ lockOnMinimize: true }) }),
    );
  });

  it("persists a group delete mode change made in the vault shell's settings screen", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("radio", { name: /keep its entries/i }));

    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ groupDeleteMode: "keepContents" }),
    );
    expect(screen.getByRole("radio", { name: /keep its entries/i })).toBeChecked();
  });

  it("persists a content protection change and applies it via WindowProtection", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore();
    const windowProtection = fakeWindowProtection();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={windowProtection}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(windowProtection.setContentProtected).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("checkbox", { name: /screen sharing/i }));

    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ contentProtection: false }),
    );
    expect(windowProtection.setContentProtected).toHaveBeenCalledWith(false);
  });

  it("persists an entry field visibility change made in the vault shell's settings screen", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("checkbox", { name: "Notes" }));

    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ entryFieldVisibility: expect.objectContaining({ notes: false }) }),
    );
    expect(screen.getByRole("checkbox", { name: "Notes" })).not.toBeChecked();
  });

  it("persists the entry list sort order and applies it to the list", async () => {
    const user = userEvent.setup();
    let vault = Vault.create("Personal");
    vault = vault.addEntry(vault.rootGroup.id, Entry.create({ title: "Zeta" }));
    vault = vault.addEntry(vault.rootGroup.id, Entry.create({ title: "Alpha" }));
    const opened: OpenedVault = { vault, filePath: "C:/vaults/personal.kdbx" };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Sort entries (Vault order)" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Title (A–Z)" }));

    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ entrySort: "title-asc" }),
    );
    const titles = screen
      .getAllByRole("button")
      .filter((button) => button.className.includes("entry-row"))
      .map((button) => button.querySelector(".entry-row-title")?.textContent);
    expect(titles).toEqual(["Alpha", "Zeta"]);
  });

  it("records an entry as opened without writing the vault file", async () => {
    const user = userEvent.setup();
    let vault = Vault.create("Personal");
    vault = vault.addEntry(vault.rootGroup.id, Entry.create({ title: "Mail" }));
    const opened: OpenedVault = { vault, filePath: "C:/vaults/personal.kdbx" };
    const vaultAccessService = fakeVaultAccessService({
      createNewVault: vi.fn().mockResolvedValue(opened),
    });

    render(
      <App
        vaultAccessService={vaultAccessService}
        settingsStore={fakeSettingsStore()}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByText("Mail"));

    expect(vaultAccessService.saveVault).not.toHaveBeenCalled();
    // The stamped vault replaces the old one in place: the row stays selected
    // and the detail pane opens, rather than the selection being lost.
    const [listRow, detailTitle] = screen.getAllByText("Mail");
    expect(listRow.closest(".entry-row")).toHaveClass("active");
    expect(detailTitle).toBeInTheDocument();
  });

  it("persists an accent color change made in the vault shell's settings screen", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("radio", { name: "Teal" }));

    expect(settingsStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ accentColor: { kind: "preset", id: "teal" } }),
    );
    expect(screen.getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true");
  });

  it("persists a theme change made in the vault shell's settings screen", async () => {
    const user = userEvent.setup();
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settingsStore = fakeSettingsStore();

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={settingsStore}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={fakeWindowEvents()}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("radio", { name: "Light" }));

    expect(settingsStore.save).toHaveBeenCalledWith(expect.objectContaining({ theme: "light" }));
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("locks the vault after the configured idle timeout with no activity", async () => {
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settings: AppSettings = {
      recentVaults: [],
      autoLock: { idleTimeoutMinutes: 1, lockOnMinimize: false, lockOnSleep: false },
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    try {
      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
          })}
          settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
          settingsTransferService={fakeSettingsTransferService()}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService()}
          globalHotkey={fakeGlobalHotkey()}
        />,
      );

      await user.click(await screen.findByRole("button", { name: /create new vault/i }));
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(70_000);
      });

      expect(screen.getByLabelText("Master password")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not lock from idle timeout while activity keeps resetting the idle clock", async () => {
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settings: AppSettings = {
      recentVaults: [],
      autoLock: { idleTimeoutMinutes: 1, lockOnMinimize: false, lockOnSleep: false },
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    try {
      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
          })}
          settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
          settingsTransferService={fakeSettingsTransferService()}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService()}
          globalHotkey={fakeGlobalHotkey()}
        />,
      );

      await user.click(await screen.findByRole("button", { name: /create new vault/i }));
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(40_000);
      });
      window.dispatchEvent(new Event("mousemove"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40_000);
      });

      expect(screen.getByRole("button", { name: "Lock vault" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("locks the vault when the system clock jumps far beyond the sleep-check interval", async () => {
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settings: AppSettings = {
      recentVaults: [],
      autoLock: { lockOnMinimize: false, lockOnSleep: true },
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    try {
      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
          })}
          settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
          settingsTransferService={fakeSettingsTransferService()}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService()}
          globalHotkey={fakeGlobalHotkey()}
        />,
      );

      await user.click(await screen.findByRole("button", { name: /create new vault/i }));
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();

      // Simulate the machine sleeping: make the next heartbeat tick observe a
      // huge gap since the last one, without disturbing when the fake timer
      // queue itself thinks "now" is (which governs when that tick fires).
      const jumpedTime = Date.now() + 6 * 60_000;
      vi.spyOn(Date, "now").mockReturnValue(jumpedTime);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(screen.getByLabelText("Master password")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not lock from a sleep-check heartbeat that isn't a real clock jump", async () => {
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settings: AppSettings = {
      recentVaults: [],
      autoLock: { lockOnMinimize: false, lockOnSleep: true },
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    try {
      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
          })}
          settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
          settingsTransferService={fakeSettingsTransferService()}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService()}
          globalHotkey={fakeGlobalHotkey()}
        />,
      );

      await user.click(await screen.findByRole("button", { name: /create new vault/i }));
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(screen.getByRole("button", { name: "Lock vault" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("locks the vault when the window is minimized, only if lock-on-minimize is enabled", async () => {
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const settings: AppSettings = {
      recentVaults: [],
      autoLock: { lockOnMinimize: true, lockOnSleep: false },
    };
    const user = userEvent.setup();
    let minimizeCallback: (() => void) | undefined;
    const windowEvents = fakeWindowEvents({
      onMinimize: vi.fn((callback: () => void) => {
        minimizeCallback = callback;
        return vi.fn();
      }),
    });

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={fakeSettingsStore({ load: vi.fn().mockResolvedValue(settings) })}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={windowEvents}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();
    expect(minimizeCallback).toBeDefined();

    act(() => {
      minimizeCallback!();
    });

    expect(await screen.findByLabelText("Master password")).toBeInTheDocument();
  });

  it("does not lock on minimize when lock-on-minimize is disabled", async () => {
    const opened: OpenedVault = {
      vault: Vault.create("Personal"),
      filePath: "C:/vaults/personal.kdbx",
    };
    const user = userEvent.setup();
    let minimizeRegistered = false;
    const windowEvents = fakeWindowEvents({
      onMinimize: vi.fn(() => {
        minimizeRegistered = true;
        return vi.fn();
      }),
    });

    render(
      <App
        vaultAccessService={fakeVaultAccessService({
          createNewVault: vi.fn().mockResolvedValue(opened),
        })}
        settingsStore={fakeSettingsStore()}
        settingsTransferService={fakeSettingsTransferService()}
        urlOpener={fakeUrlOpener()}
        clipboardWriter={fakeClipboardWriter()}
        windowEvents={windowEvents}
        windowProtection={fakeWindowProtection()}
        mergeSource={fakeMergeSource()}
        autoTypeService={fakeAutoTypeService()}
        globalHotkey={fakeGlobalHotkey()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /create new vault/i }));
    await user.type(screen.getByLabelText("Vault name"), "Personal");
    await user.type(screen.getByLabelText("Master password"), "hunter2-long");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
    await user.click(screen.getByRole("button", { name: /choose location & create/i }));

    expect(await screen.findByRole("button", { name: "Lock vault" })).toBeInTheDocument();
    expect(minimizeRegistered).toBe(false);
  });
  describe("settings import/export", () => {
    async function openSettings(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole("button", { name: /create new vault/i }));
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));
      await user.click(await screen.findByRole("button", { name: "Settings" }));
    }

    function renderUnlocked(
      settingsStore: SettingsStore,
      settingsTransferService: SettingsTransferService,
    ) {
      const opened: OpenedVault = {
        vault: Vault.create("Personal"),
        filePath: "C:/vaults/personal.kdbx",
      };
      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
          })}
          settingsStore={settingsStore}
          settingsTransferService={settingsTransferService}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService()}
          globalHotkey={fakeGlobalHotkey()}
        />,
      );
    }

    it("exports the settings it currently holds", async () => {
      const user = userEvent.setup();
      const settingsTransferService = fakeSettingsTransferService({
        exportSettings: vi.fn().mockResolvedValue("C:/share/argus-settings.json"),
      });
      renderUnlocked(fakeSettingsStore(), settingsTransferService);

      await openSettings(user);
      await user.click(screen.getByRole("button", { name: /export settings/i }));

      expect(settingsTransferService.exportSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          recentVaults: [expect.objectContaining({ path: "C:/vaults/personal.kdbx" })],
        }),
      );
      expect(
        await screen.findByText("Settings exported to argus-settings.json."),
      ).toBeInTheDocument();
    });

    it("persists and applies imported settings", async () => {
      const user = userEvent.setup();
      const imported: AppSettings = { recentVaults: [], theme: "light" };
      const settingsStore = fakeSettingsStore();
      renderUnlocked(
        settingsStore,
        fakeSettingsTransferService({
          importSettings: vi
            .fn()
            .mockResolvedValue({ settings: imported, filePath: "C:/share/from-a-friend.json" }),
        }),
      );

      await openSettings(user);
      await user.click(screen.getByRole("button", { name: /import settings/i }));

      expect(
        await screen.findByText("Settings imported from from-a-friend.json."),
      ).toBeInTheDocument();
      expect(settingsStore.save).toHaveBeenCalledWith(imported);
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    });

    it("changes nothing when the import dialog is cancelled", async () => {
      const user = userEvent.setup();
      const settingsStore = fakeSettingsStore();
      renderUnlocked(settingsStore, fakeSettingsTransferService());

      await openSettings(user);
      await user.click(screen.getByRole("button", { name: /import settings/i }));

      expect(screen.queryByText(/settings imported/i)).not.toBeInTheDocument();
    });

    it("shows why an import was rejected, leaving the current settings in place", async () => {
      const user = userEvent.setup();
      const settingsStore = fakeSettingsStore();
      renderUnlocked(
        settingsStore,
        fakeSettingsTransferService({
          importSettings: vi.fn().mockRejectedValue(new Error("That file is not valid JSON.")),
        }),
      );

      await openSettings(user);
      await user.click(screen.getByRole("button", { name: /import settings/i }));

      expect(await screen.findByText("That file is not valid JSON.")).toBeInTheDocument();
      expect(settingsStore.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ theme: "light" }),
      );
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("reports a failure to persist imported settings instead of applying them", async () => {
      const user = userEvent.setup();
      const settingsStore = fakeSettingsStore({
        save: vi.fn().mockRejectedValue(new Error("disk full")),
      });
      renderUnlocked(
        settingsStore,
        fakeSettingsTransferService({
          importSettings: vi.fn().mockResolvedValue({
            settings: { recentVaults: [], theme: "light" } satisfies AppSettings,
            filePath: "C:/share/from-a-friend.json",
          }),
        }),
      );

      await openSettings(user);
      await user.click(screen.getByRole("button", { name: /import settings/i }));

      expect(await screen.findByText("disk full")).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  describe("auto-type", () => {
    const GITHUB = Entry.create({
      title: "GitHub",
      username: "menno",
      url: "https://github.com",
    });

    function vaultWithGithub(): Vault {
      const vault = Vault.create("Personal");
      return vault.addEntry(vault.rootGroup.id, GITHUB);
    }

    /**
     * Creates a vault, opens the settings screen, and ticks the auto-type
     * checkbox — which is also what binds the hotkey, since the hook only
     * claims it while a vault is unlocked and the setting is on.
     */
    async function enableAutoType(
      user: ReturnType<typeof userEvent.setup>,
      options: {
        settingsStore?: SettingsStore;
        autoTyper?: AutoTyper;
        globalHotkey?: GlobalHotkey;
        vault?: Vault;
      } = {},
    ) {
      const settingsStore = options.settingsStore ?? fakeSettingsStore();
      const globalHotkey = options.globalHotkey ?? fakeGlobalHotkey();
      const opened: OpenedVault = {
        vault: options.vault ?? vaultWithGithub(),
        filePath: "C:/vaults/personal.kdbx",
      };

      render(
        <App
          vaultAccessService={fakeVaultAccessService({
            createNewVault: vi.fn().mockResolvedValue(opened),
          })}
          settingsStore={settingsStore}
          settingsTransferService={fakeSettingsTransferService()}
          urlOpener={fakeUrlOpener()}
          clipboardWriter={fakeClipboardWriter()}
          windowEvents={fakeWindowEvents()}
          windowProtection={fakeWindowProtection()}
          mergeSource={fakeMergeSource()}
          autoTypeService={fakeAutoTypeService(options.autoTyper)}
          globalHotkey={globalHotkey}
        />,
      );

      await user.click(await screen.findByRole("button", { name: /create new vault/i }));
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      await user.click(await screen.findByRole("button", { name: "Settings" }));
      await user.click(screen.getByRole("checkbox", { name: /hotkey/i }));

      return { settingsStore, globalHotkey };
    }

    /** Fires the handler the app handed the hotkey port, as a real press would. */
    async function pressHotkey(globalHotkey: GlobalHotkey) {
      const handler = vi.mocked(globalHotkey.register).mock.calls[0][1];
      await act(async () => {
        handler();
        await Promise.resolve();
      });
    }

    it("persists an auto-type change made in the settings screen", async () => {
      const user = userEvent.setup();

      const { settingsStore } = await enableAutoType(user);

      expect(settingsStore.save).toHaveBeenCalledWith(
        expect.objectContaining({ autoType: expect.objectContaining({ enabled: true }) }),
      );
    });

    it("offers the entries matching the captured window when the hotkey is pressed", async () => {
      const user = userEvent.setup();
      const autoTyper = fakeAutoTyper({
        captureTarget: vi
          .fn()
          .mockResolvedValue({ title: "GitHub — Firefox", processName: "firefox.exe" }),
      });

      const { globalHotkey } = await enableAutoType(user, { autoTyper });
      await pressHotkey(globalHotkey);

      expect(await screen.findByRole("dialog", { name: "Auto-type" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /GitHub/ })).toBeInTheDocument();
    });

    it("types the picked entry into the captured window", async () => {
      const user = userEvent.setup();
      const autoTyper = fakeAutoTyper({
        captureTarget: vi
          .fn()
          .mockResolvedValue({ title: "GitHub — Firefox", processName: "firefox.exe" }),
      });
      const { globalHotkey } = await enableAutoType(user, { autoTyper });
      await pressHotkey(globalHotkey);

      await user.click(await screen.findByRole("option", { name: /GitHub/ }));

      expect(autoTyper.typeIntoTarget).toHaveBeenCalledWith([
        { kind: "focus", field: "username" },
        { kind: "text", text: "menno" },
        { kind: "submit" },
      ]);
      expect(screen.queryByRole("dialog", { name: "Auto-type" })).not.toBeInTheDocument();
    });

    it("closes the picker when it is cancelled", async () => {
      const user = userEvent.setup();
      const autoTyper = fakeAutoTyper({
        captureTarget: vi
          .fn()
          .mockResolvedValue({ title: "GitHub — Firefox", processName: "firefox.exe" }),
      });
      const { globalHotkey } = await enableAutoType(user, { autoTyper });
      await pressHotkey(globalHotkey);
      expect(await screen.findByRole("dialog", { name: "Auto-type" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog", { name: "Auto-type" })).not.toBeInTheDocument();
    });

    it("never offers an entry that is in the recycle bin", async () => {
      const user = userEvent.setup();
      const deleted = Entry.create({ title: "GitHub old", url: "https://github.com" });
      const base = vaultWithGithub();
      const withDeleted = base.addEntry(base.rootGroup.id, deleted).deleteEntry(deleted.id);
      const autoTyper = fakeAutoTyper({
        captureTarget: vi
          .fn()
          .mockResolvedValue({ title: "GitHub — Firefox", processName: "firefox.exe" }),
      });

      const { globalHotkey } = await enableAutoType(user, { autoTyper, vault: withDeleted });
      await pressHotkey(globalHotkey);

      expect(await screen.findByRole("option", { name: /GitHub/ })).toBeInTheDocument();
      expect(screen.getAllByRole("option")).toHaveLength(1);
      expect(screen.queryByRole("option", { name: /GitHub old/ })).not.toBeInTheDocument();
    });

    it("says so when the OS refuses the hotkey, and lets the message be dismissed", async () => {
      const user = userEvent.setup();
      const globalHotkey = fakeGlobalHotkey({
        register: vi.fn().mockRejectedValue(new Error("hotkey already in use")),
      });

      await enableAutoType(user, { globalHotkey });

      expect(await screen.findByRole("alert")).toHaveTextContent("hotkey already in use");

      await user.click(screen.getByRole("button", { name: "Dismiss auto-type error" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
