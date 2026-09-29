import { NewVaultKeyFile } from "../application/vault-access-service";

/** What the create form has chosen so far; `path` stays unset until a dialog picks one. */
export interface NewKeyFileChoice {
  readonly enabled: boolean;
  readonly kind: NewVaultKeyFile["kind"];
  readonly path?: string;
}

export const NO_NEW_KEY_FILE: NewKeyFileChoice = { enabled: false, kind: "generate" };

/**
 * The choice as `createNewVault` takes it: `undefined` for a password-only
 * vault, or `"incomplete"` while a key file is wanted but not picked yet.
 */
export function newVaultKeyFile(
  choice: NewKeyFileChoice,
): NewVaultKeyFile | undefined | "incomplete" {
  if (!choice.enabled) {
    return undefined;
  }
  return choice.path === undefined ? "incomplete" : { kind: choice.kind, path: choice.path };
}
