import { FormEvent, useState } from "react";
import { VaultFormat } from "../../../application/vault-repository";
import {
  DEFAULT_KDF,
  KDF_LIMITS,
  VaultKdf,
  VaultKdfKind,
  VaultSettings,
  vaultSettingsError,
} from "../../../application/vault-settings";
import { useAsyncAction } from "../../use-async-action";

interface VaultSettingsCardProps {
  vaultName: string;
  /** The open vault's settings and format, once known. */
  settings: VaultSettings | undefined;
  format: VaultFormat | undefined;
  onChangeVaultSettings: (name: string, settings: VaultSettings) => Promise<void>;
}

const MIB = 1024 * 1024;

const KDF_LABELS: Record<VaultKdfKind, string> = {
  argon2id: "Argon2id",
  argon2d: "Argon2d",
  aes: "AES-KDF",
};

/** What the form holds while it's being edited: text, exactly as typed. */
interface Draft {
  name: string;
  historyMaxItems: string;
  historyMaxSizeMiB: string;
  kdfKind: VaultKdfKind;
  memoryMiB: string;
  iterations: string;
  parallelism: string;
  rounds: string;
}

function bytesToMiB(bytes: number): string {
  return String(bytes / MIB);
}

/**
 * A size typed in MiB, as bytes. A box left showing what the file had gives
 * back the file's exact byte count, which needn't be a whole number of MiB.
 */
function mibToBytes(text: string, original: number | undefined): number {
  return original !== undefined && text === bytesToMiB(original) ? original : Number(text) * MIB;
}

function draftFrom(name: string, settings: VaultSettings): Draft {
  const { kdf } = settings;
  // A vault on AES-KDF starts its Argon2 boxes at what a new vault gets, ready
  // for switching over.
  const argon2 = kdf.kind === "aes" ? DEFAULT_KDF : kdf;
  return {
    name,
    historyMaxItems: settings.historyMaxItems?.toString() ?? "",
    historyMaxSizeMiB:
      settings.historyMaxSizeBytes === undefined ? "" : bytesToMiB(settings.historyMaxSizeBytes),
    kdfKind: kdf.kind,
    memoryMiB: bytesToMiB(argon2.memoryBytes),
    iterations: String(argon2.iterations),
    parallelism: String(argon2.parallelism),
    rounds: kdf.kind === "aes" ? String(kdf.rounds) : "",
  };
}

function settingsFrom(draft: Draft, current: VaultSettings): VaultSettings {
  const currentArgon2 = current.kdf.kind === "aes" ? undefined : current.kdf;
  const kdf: VaultKdf =
    draft.kdfKind === "aes"
      ? { kind: "aes", rounds: Number(draft.rounds) }
      : {
          kind: draft.kdfKind,
          memoryBytes: mibToBytes(draft.memoryMiB, currentArgon2?.memoryBytes),
          iterations: Number(draft.iterations),
          parallelism: Number(draft.parallelism),
        };
  return {
    historyMaxItems: draft.historyMaxItems === "" ? undefined : Number(draft.historyMaxItems),
    historyMaxSizeBytes:
      draft.historyMaxSizeMiB === ""
        ? undefined
        : mibToBytes(draft.historyMaxSizeMiB, current.historyMaxSizeBytes),
    kdf,
  };
}

/**
 * Edits what the vault file says about itself: its name, how much history
 * each entry keeps, and how much work it takes to try a master password.
 * Renders nothing until the open vault's settings are known.
 */
export function VaultSettingsCard({
  vaultName,
  settings,
  format,
  onChangeVaultSettings,
}: VaultSettingsCardProps) {
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const { busy, error, run, fail, clearError } = useAsyncAction();

  if (!settings || !format) {
    return null;
  }
  const current = settings;

  const heading = (
    <div className="danger-zone-row-text">
      <span className="danger-zone-row-title">Vault settings</span>
      <span className="danger-zone-row-hint">
        The vault&apos;s name, how much history each entry keeps, and how hard its master password
        is to guess. KeePass and KeePassXC read the same settings.
      </span>
    </div>
  );

  if (!draft) {
    return (
      <div className="danger-zone-row">
        {heading}
        <button
          type="button"
          className="btn-danger-outline"
          onClick={() => setDraft(draftFrom(vaultName, current))}
        >
          Edit vault settings
        </button>
      </div>
    );
  }
  const editing = draft;

  function edit(patch: Partial<Draft>) {
    setDraft({ ...editing, ...patch });
    setSaved(false);
    clearError();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);

    const name = editing.name.trim();
    if (name === "") {
      fail("The vault needs a name.");
      return;
    }
    const next = settingsFrom(editing, current);
    const problem = vaultSettingsError(next);
    if (problem) {
      fail(problem);
      return;
    }
    if (await run(() => onChangeVaultSettings(name, next), "Failed to save the vault settings.")) {
      setSaved(true);
    }
  }

  function textField(id: string, label: string, key: keyof Draft, numeric = true) {
    return (
      <div className="field-group">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          type="text"
          inputMode={numeric ? "decimal" : undefined}
          className="field-input"
          value={editing[key]}
          onChange={(event) => edit({ [key]: event.target.value })}
        />
      </div>
    );
  }

  // KDBX 3 has only AES-KDF. On KDBX 4, AES-KDF is offered only to a vault
  // already using it: moving to it from Argon2 would be a step down.
  const kdfKinds: VaultKdfKind[] =
    format.major < 4
      ? ["aes"]
      : current.kdf.kind === "aes"
        ? ["argon2id", "argon2d", "aes"]
        : ["argon2id", "argon2d"];

  return (
    <div className="danger-zone-row expanded">
      {heading}
      <form className="danger-zone-form" onSubmit={(event) => void handleSubmit(event)}>
        {textField("vault-settings-name", "Vault name", "name", false)}
        {textField(
          "vault-settings-history-items",
          "Earlier versions kept per entry (blank = no limit)",
          "historyMaxItems",
        )}
        {textField(
          "vault-settings-history-size",
          "History size per entry, in MiB (blank = no limit)",
          "historyMaxSizeMiB",
        )}

        <div className="field-group">
          <label className="field-label" htmlFor="vault-settings-kdf">
            Key derivation
          </label>
          <select
            id="vault-settings-kdf"
            className="field-select"
            value={editing.kdfKind}
            disabled={kdfKinds.length === 1}
            onChange={(event) => edit({ kdfKind: event.target.value as VaultKdfKind })}
          >
            {kdfKinds.map((kind) => (
              <option key={kind} value={kind}>
                {KDF_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>

        {editing.kdfKind === "aes" ? (
          textField(
            "vault-settings-rounds",
            `Rounds (up to ${KDF_LIMITS.aesMaxRounds.toLocaleString("en-US")})`,
            "rounds",
          )
        ) : (
          <>
            {textField(
              "vault-settings-memory",
              `Memory, in MiB (up to ${KDF_LIMITS.argon2MaxMemoryBytes / MIB})`,
              "memoryMiB",
            )}
            {textField(
              "vault-settings-iterations",
              `Iterations (up to ${KDF_LIMITS.argon2MaxIterations})`,
              "iterations",
            )}
            {textField(
              "vault-settings-parallelism",
              `Parallelism (up to ${KDF_LIMITS.argon2MaxParallelism})`,
              "parallelism",
            )}
          </>
        )}
        <div className="danger-zone-row-hint">
          Higher key derivation values make guessing the master password slower, and every unlock
          and save along with it.
          {format.major < 4 && " Argon2 needs KDBX 4: upgrade the file format below to use it."}
        </div>

        {error && <div className="field-error">{error}</div>}
        {saved && <div className="field-success">Vault settings saved.</div>}
        <div className="danger-zone-actions">
          <button type="submit" className="btn-danger" disabled={busy}>
            {busy ? "Re-encrypting…" : "Save vault settings"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              setDraft(undefined);
              setSaved(false);
              clearError();
            }}
          >
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
