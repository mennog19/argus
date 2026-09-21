import { Consts, KdbxEntry } from "kdbxweb";
import { EntryIcon } from "../domain";

/**
 * Entry CustomData key holding Argus's own icon choice (`library:star`,
 * `brand:github`, or `library:star:235` for a library icon with a manual
 * colour override).
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
 * Reads an entry's icon. Argus's CustomData wins only while it still agrees
 * with the KeePass icon id — if another app changed the icon since, that
 * app's choice is what's shown. Custom (image) icons aren't rendered yet, so
 * they read as automatic.
 */
export function iconFromKdbx(kdbxEntry: KdbxEntry): EntryIcon {
  if (kdbxEntry.customIcon) {
    return EntryIcon.AUTO;
  }
  const keepassId = kdbxEntry.icon ?? Icons.Key;
  const stored = EntryIcon.parse(kdbxEntry.customData?.get(ICON_CUSTOM_DATA_KEY)?.value ?? "");
  if (stored?.kind === "brand" && keepassId === BRAND_KEEPASS_ID) {
    return stored;
  }
  if (stored?.kind === "library" && LIBRARY_ICON_KEEPASS_IDS[stored.key] === keepassId) {
    return stored;
  }
  const libraryKey = LIBRARY_KEY_BY_KEEPASS_ID.get(keepassId);
  return libraryKey ? EntryIcon.library(libraryKey) : EntryIcon.AUTO;
}

/** Writes an icon choice as both a KeePass standard icon and Argus CustomData. */
export function writeIconToKdbx(kdbxEntry: KdbxEntry, icon: EntryIcon): void {
  kdbxEntry.customIcon = undefined;
  if (icon.kind === "auto") {
    kdbxEntry.icon = Icons.Key;
    kdbxEntry.customData?.delete(ICON_CUSTOM_DATA_KEY);
    return;
  }
  kdbxEntry.icon =
    icon.kind === "brand" ? BRAND_KEEPASS_ID : (LIBRARY_ICON_KEEPASS_IDS[icon.key] ?? Icons.Key);
  kdbxEntry.customData ??= new Map();
  kdbxEntry.customData.set(ICON_CUSTOM_DATA_KEY, { value: icon.toString() });
}
