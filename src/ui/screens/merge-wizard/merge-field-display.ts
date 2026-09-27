import { Entry, MergeFieldKey, mergeFieldValue } from "../../../domain";

export const FIELD_LABELS: Record<MergeFieldKey, string> = {
  title: "Title",
  username: "Username",
  password: "Password",
  url: "URL",
  totp: "Authenticator",
};

/**
 * How a merge field reads on screen. Secrets stay masked until the user asks
 * for them, and an absent value reads as a dash rather than an empty cell so
 * "mine has no URL, theirs does" is visible as a difference.
 */
export function displayValue(entry: Entry, field: MergeFieldKey, revealSecrets: boolean): string {
  const value = mergeFieldValue(entry, field);
  if (value === "") {
    return field === "totp" ? "Not set" : "—";
  }
  if (field === "password") {
    return revealSecrets ? value : "••••••••";
  }
  if (field === "totp") {
    return revealSecrets ? value : "Configured";
  }
  return value;
}
