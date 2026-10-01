import { EntryFieldName } from "../../../domain";

const FIELD_NAMES: Record<EntryFieldName, string> = {
  title: "title",
  username: "username",
  password: "password",
  url: "URL",
  notes: "notes",
  tags: "tags",
  customFields: "custom fields",
  attachments: "attachments",
  icon: "icon",
  expiry: "expiry date",
};

/**
 * What an edit changed, e.g. "Password and URL changed". An edit can change
 * only what Argus doesn't show, such as an auto-type setting in KeePass, so
 * "no visible changes" is a real case, not an error.
 */
export function describeChanges(fields: readonly EntryFieldName[]): string {
  if (fields.length === 0) {
    return "No visible changes";
  }
  const names = fields.map((field) => FIELD_NAMES[field]);
  const last = names.pop()!;
  const list = names.length > 0 ? `${names.join(", ")} and ${last}` : last;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} changed`;
}
