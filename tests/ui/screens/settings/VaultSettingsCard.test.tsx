import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultFormat } from "../../../../src/application/vault-repository";
import { DEFAULT_KDF, VaultSettings } from "../../../../src/application/vault-settings";
import { VaultSettingsCard } from "../../../../src/ui/screens/settings/VaultSettingsCard";
import { NEW_VAULT_SETTINGS } from "../../vault-file-fakes";

type User = ReturnType<typeof userEvent.setup>;

const MIB = 1024 * 1024;
const KDBX4: VaultFormat = { major: 4, minor: 1 };
const KDBX3: VaultFormat = { major: 3, minor: 1 };
const AES_SETTINGS: VaultSettings = { ...NEW_VAULT_SETTINGS, kdf: { kind: "aes", rounds: 60000 } };

function renderCard(
  overrides: {
    vaultName?: string;
    settings?: VaultSettings | null;
    format?: VaultFormat | null;
    onChangeVaultSettings?: (name: string, settings: VaultSettings) => Promise<void>;
  } = {},
) {
  const onChangeVaultSettings =
    overrides.onChangeVaultSettings ?? vi.fn().mockResolvedValue(undefined);
  const view = render(
    <VaultSettingsCard
      vaultName={overrides.vaultName ?? "Personal"}
      settings={
        overrides.settings === null ? undefined : (overrides.settings ?? NEW_VAULT_SETTINGS)
      }
      format={overrides.format === null ? undefined : (overrides.format ?? KDBX4)}
      onChangeVaultSettings={onChangeVaultSettings}
    />,
  );
  return { onChangeVaultSettings, container: view.container };
}

async function open(user: User) {
  await user.click(screen.getByRole("button", { name: "Edit vault settings" }));
}

async function retype(user: User, label: RegExp | string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value !== "") {
    await user.type(input, value);
  }
}

async function save(user: User) {
  await user.click(screen.getByRole("button", { name: "Save vault settings" }));
}

describe("VaultSettingsCard", () => {
  it("renders nothing until the vault's settings and format are known", () => {
    expect(renderCard({ settings: null }).container).toBeEmptyDOMElement();
    expect(renderCard({ format: null }).container).toBeEmptyDOMElement();
  });

  it("shows only a button until it's pressed", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Edit vault settings" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Vault name")).not.toBeInTheDocument();
  });

  it("opens on the vault's current settings", async () => {
    const user = userEvent.setup();
    renderCard();

    await open(user);

    expect(screen.getByLabelText("Vault name")).toHaveValue("Personal");
    expect(screen.getByLabelText(/^Earlier versions kept/)).toHaveValue("10");
    expect(screen.getByLabelText(/^History size/)).toHaveValue("6");
    expect(screen.getByLabelText("Key derivation")).toHaveValue("argon2id");
    expect(screen.getByLabelText(/^Memory/)).toHaveValue("64");
    expect(screen.getByLabelText(/^Iterations/)).toHaveValue("4");
    expect(screen.getByLabelText(/^Parallelism/)).toHaveValue("2");
    expect(screen.queryByLabelText(/^Rounds/)).not.toBeInTheDocument();
  });

  it("shows unlimited history as blank boxes, and saves them as unlimited", async () => {
    const user = userEvent.setup();
    const { onChangeVaultSettings } = renderCard({
      settings: {
        ...NEW_VAULT_SETTINGS,
        historyMaxItems: undefined,
        historyMaxSizeBytes: undefined,
      },
    });

    await open(user);

    expect(screen.getByLabelText(/^Earlier versions kept/)).toHaveValue("");
    expect(screen.getByLabelText(/^History size/)).toHaveValue("");

    await save(user);

    expect(onChangeVaultSettings).toHaveBeenCalledWith(
      "Personal",
      expect.objectContaining({ historyMaxItems: undefined, historyMaxSizeBytes: undefined }),
    );
  });

  it("saves the name and settings as edited", async () => {
    const user = userEvent.setup();
    const { onChangeVaultSettings } = renderCard();

    await open(user);
    await retype(user, "Vault name", "  Work  ");
    await retype(user, /^Earlier versions kept/, "");
    await retype(user, /^History size/, "2");
    await user.selectOptions(screen.getByLabelText("Key derivation"), "argon2d");
    await retype(user, /^Memory/, "128");
    await retype(user, /^Iterations/, "6");
    await retype(user, /^Parallelism/, "4");
    await save(user);

    expect(onChangeVaultSettings).toHaveBeenCalledExactlyOnceWith("Work", {
      historyMaxItems: undefined,
      historyMaxSizeBytes: 2 * MIB,
      kdf: { kind: "argon2d", memoryBytes: 128 * MIB, iterations: 6, parallelism: 4 },
    });
    expect(await screen.findByText("Vault settings saved.")).toBeInTheDocument();
  });

  it("gives back sizes it didn't touch byte for byte, even when they aren't whole MiB", async () => {
    const user = userEvent.setup();
    const settings: VaultSettings = {
      historyMaxItems: 10,
      historyMaxSizeBytes: 1_500_001,
      kdf: { kind: "argon2id", memoryBytes: 10_000_000, iterations: 2, parallelism: 1 },
    };
    const { onChangeVaultSettings } = renderCard({ settings });

    await open(user);
    await save(user);

    expect(onChangeVaultSettings).toHaveBeenCalledExactlyOnceWith("Personal", settings);
  });

  it("sets a history size on a vault that had no limit", async () => {
    const user = userEvent.setup();
    const { onChangeVaultSettings } = renderCard({
      settings: { ...NEW_VAULT_SETTINGS, historyMaxSizeBytes: undefined },
    });

    await open(user);
    await retype(user, /^History size/, "6");
    await save(user);

    expect(onChangeVaultSettings).toHaveBeenCalledWith("Personal", NEW_VAULT_SETTINGS);
  });

  it("refuses a blank name", async () => {
    const user = userEvent.setup();
    const { onChangeVaultSettings } = renderCard();

    await open(user);
    await retype(user, "Vault name", "   ");
    await save(user);

    expect(screen.getByText("The vault needs a name.")).toBeInTheDocument();
    expect(onChangeVaultSettings).not.toHaveBeenCalled();
  });

  it("refuses settings Argus wouldn't unlock again, and clears the message on the next edit", async () => {
    const user = userEvent.setup();
    const { onChangeVaultSettings } = renderCard();

    await open(user);
    await retype(user, /^Iterations/, "5000");
    await save(user);

    expect(screen.getByText("Iterations must be between 1 and 1000.")).toBeInTheDocument();
    expect(onChangeVaultSettings).not.toHaveBeenCalled();

    await retype(user, /^Iterations/, "5");

    expect(screen.queryByText("Iterations must be between 1 and 1000.")).not.toBeInTheDocument();
  });

  it("refuses a box that doesn't hold a number", async () => {
    const user = userEvent.setup();
    renderCard();

    await open(user);
    await retype(user, /^Memory/, "lots");
    await save(user);

    expect(screen.getByText("Memory must be between 1 and 1024 MiB.")).toBeInTheDocument();
  });

  it("edits the rounds of a KDBX 3 vault, which has no other key derivation", async () => {
    const user = userEvent.setup();
    const { onChangeVaultSettings } = renderCard({ settings: AES_SETTINGS, format: KDBX3 });

    await open(user);

    expect(screen.getByLabelText("Key derivation")).toBeDisabled();
    expect(screen.getByLabelText("Key derivation")).toHaveValue("aes");
    expect(screen.getByLabelText(/^Rounds/)).toHaveValue("60000");
    expect(screen.queryByLabelText(/^Memory/)).not.toBeInTheDocument();
    expect(screen.getByText(/Argon2 needs KDBX 4/)).toBeInTheDocument();

    await retype(user, /^Rounds/, "1000000");
    await save(user);

    expect(onChangeVaultSettings).toHaveBeenCalledWith("Personal", {
      ...AES_SETTINGS,
      kdf: { kind: "aes", rounds: 1_000_000 },
    });
  });

  it("moves a KDBX 4 vault from AES-KDF to Argon2id at a new vault's strength", async () => {
    const user = userEvent.setup();
    const { onChangeVaultSettings } = renderCard({ settings: AES_SETTINGS });

    await open(user);

    expect(screen.getByRole("option", { name: "AES-KDF" })).toBeInTheDocument();
    expect(screen.queryByText(/Argon2 needs KDBX 4/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Key derivation"), "argon2id");

    expect(screen.getByLabelText(/^Memory/)).toHaveValue("64");

    await save(user);

    expect(onChangeVaultSettings).toHaveBeenCalledWith("Personal", {
      ...AES_SETTINGS,
      kdf: { kind: "argon2id", ...DEFAULT_KDF },
    });
  });

  it("doesn't offer AES-KDF to a vault already on Argon2", async () => {
    const user = userEvent.setup();
    renderCard();

    await open(user);

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Argon2id",
      "Argon2d",
    ]);
  });

  it("shows why the save failed, and drops the success note on the next edit", async () => {
    const user = userEvent.setup();
    const onChangeVaultSettings = vi
      .fn()
      .mockRejectedValueOnce(new Error("Disk full"))
      .mockRejectedValueOnce(undefined)
      .mockResolvedValue(undefined);
    renderCard({ onChangeVaultSettings });

    await open(user);
    await save(user);

    expect(await screen.findByText("Disk full")).toBeInTheDocument();
    expect(screen.queryByText("Vault settings saved.")).not.toBeInTheDocument();

    await save(user);

    expect(await screen.findByText("Failed to save the vault settings.")).toBeInTheDocument();

    await save(user);

    expect(await screen.findByText("Vault settings saved.")).toBeInTheDocument();

    await retype(user, "Vault name", "Work");

    expect(screen.queryByText("Vault settings saved.")).not.toBeInTheDocument();
  });

  it("closes without saving, and reopens on the vault's settings rather than the abandoned edit", async () => {
    const user = userEvent.setup();
    const { onChangeVaultSettings } = renderCard();

    await open(user);
    await retype(user, "Vault name", "Abandoned");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByLabelText("Vault name")).not.toBeInTheDocument();
    expect(onChangeVaultSettings).not.toHaveBeenCalled();

    await open(user);

    expect(screen.getByLabelText("Vault name")).toHaveValue("Personal");
  });

  it("disables the buttons while the save is in flight", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onChangeVaultSettings = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderCard({ onChangeVaultSettings });

    await open(user);
    await save(user);

    expect(screen.getByRole("button", { name: "Re-encrypting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

    finish();

    expect(await screen.findByText("Vault settings saved.")).toBeInTheDocument();
  });
});
