import {
  MASTER_PASSWORD_MIN_LENGTH,
  MasterPasswordRequirement,
  unmetMasterPasswordRequirements,
} from "../domain";

const REQUIREMENT_TEXT: Readonly<Record<MasterPasswordRequirement, string>> = {
  length: `at least ${MASTER_PASSWORD_MIN_LENGTH} characters`,
  uppercase: "a capital letter",
  digit: "a number",
  symbol: "a symbol",
};

/** Shown as the placeholder of every new-master-password box. */
export const MASTER_PASSWORD_HINT = `${MASTER_PASSWORD_MIN_LENGTH}+ characters, with A-Z, 0-9 and a symbol`;

function joinWithAnd(parts: readonly string[]): string {
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Why `password` can't be a new master password — naming everything it's
 * still missing in one go, so nobody fixes one rule only to be told about the
 * next — or undefined when it's fine. `subject` opens the sentence.
 */
export function masterPasswordRuleError(subject: string, password: string): string | undefined {
  const unmet = unmetMasterPasswordRequirements(password);
  if (unmet.length === 0) {
    return undefined;
  }
  return `${subject} needs ${joinWithAnd(unmet.map((requirement) => REQUIREMENT_TEXT[requirement]))}.`;
}
