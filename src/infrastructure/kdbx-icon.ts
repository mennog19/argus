import { Consts, KdbxEntry, KdbxGroup } from "kdbxweb";
import { Icon } from "../domain";
import { domainIdToKdbxUuid, kdbxUuidToDomainId } from "./kdbx-id";

/** An entry or group, the two KDBX node types that carry an icon. */
type KdbxIconHost = KdbxEntry | KdbxGroup;

/**
 * CustomData key holding Argus's own icon choice for an entry or group
 * (`library:star`, `brand:github`, or `library:star:235` for a library icon
 * with a manual colour override).
 */
export const ICON_CUSTOM_DATA_KEY = "Argus.Icon";

const Icons = Consts.Icons;

/**
 * Nearest KeePass standard icon for every library icon, so a choice made in
 * Argus shows up sensibly in KeePass/KeePassXC. Order matters: the first key
 * listed for a KeePass id is the one that id reads back as when a vault
 * carries no Argus CustomData (e.g. an icon picked in KeePassXC).
 */
export const LIBRARY_ICON_KEEPASS_IDS: Readonly<Record<string, number>> = {
  globe: Icons.World,
  warning: Icons.Warning,
  server: Icons.NetworkServer,
  chat: Icons.UserCommunication,
  note: Icons.Notepad,
  router: Icons.WorldSocket,
  identity: Icons.Identity,
  camera: Icons.Digicam,
  wifi: Icons.IRCommunication,
  keys: Icons.MultiKeys,
  disc: Icons.CDRom,
  monitor: Icons.Monitor,
  mail: Icons.EMail,
  clipboard: Icons.ClipboardReady,
  document: Icons.PaperNew,
  tv: Icons.Screen,
  terminal: Icons.Console,
  printer: Icons.Printer,
  settings: Icons.Settings,
  cloud: Icons.WorldComputer,
  archive: Icons.Archive,
  bank: Icons.Homebanking,
  clock: Icons.Clock,
  flag: Icons.PaperFlag,
  chip: Icons.Memory,
  trash: Icons.TrashBin,
  info: Icons.Info,
  package: Icons.Package,
  folder: Icons.Folder,
  lock: Icons.PaperLocked,
  check: Icons.Checked,
  pen: Icons.Pen,
  image: Icons.Thumbnail,
  book: Icons.Book,
  list: Icons.List,
  user: Icons.UserKey,
  tools: Icons.Tool,
  home: Icons.Home,
  star: Icons.Star,
  feather: Icons.Feather,
  wiki: Icons.Wiki,
  money: Icons.Money,
  certificate: Icons.Certificate,
  phone: Icons.BlackBerry,
  // No KeePass equivalent of their own — mapped to the closest one.
  key: Icons.Key,
  shield: Icons.Key,
  fingerprint: Icons.Key,
  heart: Icons.Key,
  car: Icons.Key,
  food: Icons.Key,
  pet: Icons.Key,
  health: Icons.Key,
  fitness: Icons.Key,
  sun: Icons.Key,
  "letter-a": Icons.Key,
  "letter-b": Icons.Key,
  "letter-c": Icons.Key,
  "letter-d": Icons.Key,
  "letter-e": Icons.Key,
  "letter-f": Icons.Key,
  "letter-g": Icons.Key,
  "letter-h": Icons.Key,
  "letter-i": Icons.Key,
  "letter-j": Icons.Key,
  "letter-k": Icons.Key,
  "letter-l": Icons.Key,
  "letter-m": Icons.Key,
  "letter-n": Icons.Key,
  "letter-o": Icons.Key,
  "letter-p": Icons.Key,
  "letter-q": Icons.Key,
  "letter-r": Icons.Key,
  "letter-s": Icons.Key,
  "letter-t": Icons.Key,
  "letter-u": Icons.Key,
  "letter-v": Icons.Key,
  "letter-w": Icons.Key,
  "letter-x": Icons.Key,
  "letter-y": Icons.Key,
  "letter-z": Icons.Key,
  luggage: Icons.Package,
  briefcase: Icons.Package,
  gift: Icons.Package,
  plane: Icons.World,
  card: Icons.Money,
  wallet: Icons.Money,
  bitcoin: Icons.Money,
  cart: Icons.Money,
  school: Icons.Book,
  people: Icons.UserCommunication,
  database: Icons.NetworkServer,
  code: Icons.Console,
  gamepad: Icons.Monitor,
  music: Icons.CDRom,
  film: Icons.Screen,
  calendar: Icons.Clock,
};

/** Brands have no KeePass counterpart; they're written with the generic "World" icon. */
const BRAND_KEEPASS_ID = Icons.World;

const LIBRARY_KEY_BY_KEEPASS_ID = new Map<number, string>();
for (const [key, id] of Object.entries(LIBRARY_ICON_KEEPASS_IDS)) {
  // Key (0) is every KeePass entry's default, so it means "automatic", not a choice.
  if (id !== Icons.Key && !LIBRARY_KEY_BY_KEEPASS_ID.has(id)) {
    LIBRARY_KEY_BY_KEEPASS_ID.set(id, key);
  }
}

/**
 * Reads an entry or group's icon. A custom (image) icon wins, as it does in
 * KeePass. Otherwise Argus's CustomData wins only while it still agrees with
 * the KeePass icon id — if another app changed the icon since, that app's
 * choice is what's shown.
 */
export function iconFromKdbx(kdbxItem: KdbxIconHost): Icon {
  if (kdbxItem.customIcon && !kdbxItem.customIcon.empty) {
    return Icon.custom(kdbxUuidToDomainId(kdbxItem.customIcon));
  }
  const keepassId = kdbxItem.icon ?? Icons.Key;
  const stored = Icon.parse(kdbxItem.customData?.get(ICON_CUSTOM_DATA_KEY)?.value ?? "");
  if (stored?.kind === "brand" && keepassId === BRAND_KEEPASS_ID) {
    return stored;
  }
  if (stored?.kind === "library" && LIBRARY_ICON_KEEPASS_IDS[stored.key] === keepassId) {
    return stored;
  }
  const libraryKey = LIBRARY_KEY_BY_KEEPASS_ID.get(keepassId);
  return libraryKey ? Icon.library(libraryKey) : Icon.AUTO;
}

/**
 * Writes an icon choice as both a KeePass standard icon and Argus CustomData,
 * or, for a custom icon, as the KDBX custom icon reference KeePass reads.
 */
export function writeIconToKdbx(kdbxItem: KdbxIconHost, icon: Icon): void {
  kdbxItem.customIcon = icon.kind === "custom" ? domainIdToKdbxUuid(icon.key) : undefined;
  if (icon.kind === "auto" || icon.kind === "custom") {
    kdbxItem.icon = Icons.Key;
    kdbxItem.customData?.delete(ICON_CUSTOM_DATA_KEY);
    return;
  }
  kdbxItem.icon =
    icon.kind === "brand" ? BRAND_KEEPASS_ID : (LIBRARY_ICON_KEEPASS_IDS[icon.key] ?? Icons.Key);
  kdbxItem.customData ??= new Map();
  kdbxItem.customData.set(ICON_CUSTOM_DATA_KEY, { value: icon.toString() });
}
