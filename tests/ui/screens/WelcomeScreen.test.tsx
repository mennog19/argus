import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Vault } from "../../../src/domain";
import { OpenedVault, VaultAccessService } from "../../../src/application/vault-access-service";
import { RecentVaultEntry } from "../../../src/application/settings";
import { WelcomeScreen } from "../../../src/ui/screens/WelcomeScreen";

function fakeService(overrides: Partial<VaultAccessService> = {}): VaultAccessService {
  return {
    openExistingVault: vi.fn(),
    createNewVault: vi.fn(),
    openVaultAtPath: vi.fn(),
    pickKeyFile: vi.fn(),
    pickPathForNewKeyFile: vi.fn(),
    ...overrides,
  } as unknown as VaultAccessService;
}

describe("WelcomeScreen", () => {
  it("shows Open/Create actions and no recent-vaults list when there are none", () => {
    render(
      <WelcomeScreen
        recentVaults={[]}
        vaultAccessService={fakeService()}
        onOpened={vi.fn()}
        onSelectRecent={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /open existing vault/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create new vault/i })).toBeInTheDocument();
    expect(screen.queryByText("Recent vaults")).not.toBeInTheDocument();
  });

  it("lists recent vaults and calls onSelectRecent when one is clicked", async () => {
    const user = userEvent.setup();
    const onSelectRecent = vi.fn();
    const recentVaults: RecentVaultEntry[] = [
      { path: "C:/vaults/personal.kdbx", lastOpenedAt: new Date().toISOString() },
    ];

    render(
      <WelcomeScreen
        recentVaults={recentVaults}
        vaultAccessService={fakeService()}
        onOpened={vi.fn()}
        onSelectRecent={onSelectRecent}
      />,
    );

    await user.click(screen.getByText("personal.kdbx"));

    expect(onSelectRecent).toHaveBeenCalledWith("C:/vaults/personal.kdbx");
  });

  describe("open flow", () => {
    it("opens the vault and calls onOpened on success", async () => {
      const user = userEvent.setup();
      const opened: OpenedVault = { vault: Vault.create("Mine"), filePath: "C:/vaults/mine.kdbx" };
      const onOpened = vi.fn();
      const service = fakeService({ openExistingVault: vi.fn().mockResolvedValue(opened) });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={onOpened}
          onSelectRecent={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /open existing vault/i }));
      await user.type(screen.getByLabelText("Master password"), "Hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose file & unlock/i }));

      expect(service.openExistingVault).toHaveBeenCalledWith("Hunter2-long", undefined);
      expect(onOpened).toHaveBeenCalledWith(opened);
    });

    it("opens the vault with a key file when one is chosen", async () => {
      const user = userEvent.setup();
      const service = fakeService({
        pickKeyFile: vi.fn().mockResolvedValue("C:/keys/mine.keyx"),
        openExistingVault: vi.fn().mockResolvedValue(undefined),
      });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /open existing vault/i }));
      await user.click(screen.getByRole("button", { name: "Use a key file…" }));
      await user.click(screen.getByRole("button", { name: /choose file & unlock/i }));

      expect(service.openExistingVault).toHaveBeenCalledWith("", "C:/keys/mine.keyx");
    });

    it("forgets the chosen key file on Back", async () => {
      const user = userEvent.setup();
      const service = fakeService({ pickKeyFile: vi.fn().mockResolvedValue("C:/keys/mine.keyx") });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /open existing vault/i }));
      await user.click(screen.getByRole("button", { name: "Use a key file…" }));
      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.click(screen.getByRole("button", { name: /open existing vault/i }));

      expect(screen.queryByText("Key file: mine.keyx")).not.toBeInTheDocument();
    });

    it("does nothing when the user cancels the file dialog", async () => {
      const user = userEvent.setup();
      const onOpened = vi.fn();
      const service = fakeService({ openExistingVault: vi.fn().mockResolvedValue(undefined) });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={onOpened}
          onSelectRecent={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /open existing vault/i }));
      await user.click(screen.getByRole("button", { name: /choose file & unlock/i }));

      expect(onOpened).not.toHaveBeenCalled();
      expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
    });

    it("shows the error message when opening fails", async () => {
      const user = userEvent.setup();
      const service = fakeService({
        openExistingVault: vi.fn().mockRejectedValue(new Error("Invalid credentials")),
      });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /open existing vault/i }));
      await user.click(screen.getByRole("button", { name: /choose file & unlock/i }));

      expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
    });

    it("falls back to a generic message when a non-Error is thrown", async () => {
      const user = userEvent.setup();
      const service = fakeService({ openExistingVault: vi.fn().mockRejectedValue("boom") });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /open existing vault/i }));
      await user.click(screen.getByRole("button", { name: /choose file & unlock/i }));

      expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("returns to idle when Back is clicked", async () => {
      const user = userEvent.setup();
      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={fakeService()}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /open existing vault/i }));
      await user.click(screen.getByRole("button", { name: /back/i }));

      expect(screen.getByRole("button", { name: /open existing vault/i })).toBeInTheDocument();
    });
  });

  describe("create flow", () => {
    async function openCreateForm(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: /create new vault/i }));
    }

    it("validates the name is required", async () => {
      const user = userEvent.setup();
      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={fakeService()}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByText("Vault name is required.")).toBeInTheDocument();
    });

    it("validates the password is required", async () => {
      const user = userEvent.setup();
      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={fakeService()}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByText("Master password is required.")).toBeInTheDocument();
    });

    it("rejects a master password that breaks the rules, saying which", async () => {
      const user = userEvent.setup();
      const service = fakeService();
      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "Short1!");
      await user.type(screen.getByLabelText("Confirm password"), "Short1!");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(
        await screen.findByText("Master password needs at least 8 characters."),
      ).toBeInTheDocument();
      expect(service.createNewVault).not.toHaveBeenCalled();
    });

    it("shows the strength of the master password as it is typed", async () => {
      const user = userEvent.setup();
      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={fakeService()}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.type(screen.getByLabelText("Master password"), "short");

      expect(screen.getByText("Weak")).toBeInTheDocument();
    });

    it("validates the passwords match", async () => {
      const user = userEvent.setup();
      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={fakeService()}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "Hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "different");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    });

    it("creates the vault and calls onOpened on success", async () => {
      const user = userEvent.setup();
      const opened: OpenedVault = {
        vault: Vault.create("Personal"),
        filePath: "C:/vaults/personal.kdbx",
      };
      const onOpened = vi.fn();
      const service = fakeService({ createNewVault: vi.fn().mockResolvedValue(opened) });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={onOpened}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "Hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "Hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(service.createNewVault).toHaveBeenCalledWith("Personal", "Hunter2-long", undefined);
      expect(onOpened).toHaveBeenCalledWith(opened);
    });

    async function fillCreateForm(user: ReturnType<typeof userEvent.setup>) {
      await openCreateForm(user);
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "Hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "Hunter2-long");
    }

    it("creates the vault with a generated key file saved where the user chose", async () => {
      const user = userEvent.setup();
      const service = fakeService({
        pickPathForNewKeyFile: vi.fn().mockResolvedValue("D:/keys/Personal.keyx"),
        createNewVault: vi.fn().mockResolvedValue(undefined),
      });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await fillCreateForm(user);
      await user.click(screen.getByLabelText("Also protect with a key file"));
      await user.click(screen.getByRole("button", { name: "Choose where to save it…" }));
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(service.pickPathForNewKeyFile).toHaveBeenCalledWith("Personal");
      expect(service.createNewVault).toHaveBeenCalledWith("Personal", "Hunter2-long", {
        kind: "generate",
        path: "D:/keys/Personal.keyx",
      });
    });

    it("creates the vault with an existing file as its key file", async () => {
      const user = userEvent.setup();
      const service = fakeService({
        pickKeyFile: vi.fn().mockResolvedValue("D:/keys/photo.jpg"),
        createNewVault: vi.fn().mockResolvedValue(undefined),
      });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await fillCreateForm(user);
      await user.click(screen.getByLabelText("Also protect with a key file"));
      await user.click(screen.getByRole("radio", { name: "Use existing file" }));
      await user.click(screen.getByRole("button", { name: "Choose a file…" }));
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(service.createNewVault).toHaveBeenCalledWith("Personal", "Hunter2-long", {
        kind: "existing",
        path: "D:/keys/photo.jpg",
      });
    });

    it.each([
      ["Generate new", "Choose where to save the key file."],
      ["Use existing file", "Choose the file to use as a key file."],
    ])("refuses to create with %s ticked but no file chosen yet", async (kindLabel, message) => {
      const user = userEvent.setup();
      const service = fakeService();

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await fillCreateForm(user);
      await user.click(screen.getByLabelText("Also protect with a key file"));
      await user.click(screen.getByRole("radio", { name: kindLabel }));
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(service.createNewVault).not.toHaveBeenCalled();
    });

    it("resets the key file choice on Back", async () => {
      const user = userEvent.setup();

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={fakeService()}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.click(screen.getByLabelText("Also protect with a key file"));
      await user.click(screen.getByRole("button", { name: "Back" }));
      await openCreateForm(user);

      expect(screen.getByLabelText("Also protect with a key file")).not.toBeChecked();
    });

    it("does nothing when the user cancels the save dialog", async () => {
      const user = userEvent.setup();
      const onOpened = vi.fn();
      const service = fakeService({ createNewVault: vi.fn().mockResolvedValue(undefined) });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={onOpened}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "Hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "Hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(onOpened).not.toHaveBeenCalled();
    });

    it("shows the error message when creation fails", async () => {
      const user = userEvent.setup();
      const service = fakeService({
        createNewVault: vi.fn().mockRejectedValue(new Error("Disk is full")),
      });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "Hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "Hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByText("Disk is full")).toBeInTheDocument();
    });

    it("falls back to a generic message when a non-Error is thrown", async () => {
      const user = userEvent.setup();
      const service = fakeService({ createNewVault: vi.fn().mockRejectedValue("boom") });

      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={service}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.type(screen.getByLabelText("Vault name"), "Personal");
      await user.type(screen.getByLabelText("Master password"), "Hunter2-long");
      await user.type(screen.getByLabelText("Confirm password"), "Hunter2-long");
      await user.click(screen.getByRole("button", { name: /choose location & create/i }));

      expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("returns to idle when Back is clicked", async () => {
      const user = userEvent.setup();
      render(
        <WelcomeScreen
          recentVaults={[]}
          vaultAccessService={fakeService()}
          onOpened={vi.fn()}
          onSelectRecent={vi.fn()}
        />,
      );

      await openCreateForm(user);
      await user.click(screen.getByRole("button", { name: /back/i }));

      expect(screen.getByRole("button", { name: /create new vault/i })).toBeInTheDocument();
    });
  });
});
