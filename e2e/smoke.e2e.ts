import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KdbxVaultRepository } from "../src/infrastructure/kdbx-vault-repository";
import { collectAllEntries } from "../src/ui/vault-browsing";
import { appExecutable, DRIVER_URL, fixturePath, isolateAppData, startDriver } from "./harness";
import { Locator, WebDriverSession } from "./webdriver";

/** Must match `$MasterPassword` in `scripts/generate-keepass-fixtures.ps1`. */
const MASTER_PASSWORD = "Fixture-passw0rd!";

const NEW_ENTRY = { title: "E2E login", username: "e2e-user", password: "e2e-Passw0rd!" };

const MASTER_PASSWORD_BOX: Locator = { css: "input[aria-label='Master password']" };
const UNLOCK_BUTTON: Locator = { xpath: "//button[normalize-space()='Unlock']" };
const LOCK_BUTTON: Locator = { css: "button[aria-label='Lock vault']" };
const LOCKED_HEADING: Locator = { xpath: "//h1[normalize-space()='Unlock your vault']" };

function entryRow(title: string): Locator {
  return { xpath: `//div[@class='entry-row-title'][normalize-space()='${title}']` };
}

/** Reads the vault file the way any KeePass client would, with none of the app involved. */
async function entriesOnDisk(vaultPath: string) {
  const bytes = readFileSync(vaultPath);
  const session = await new KdbxVaultRepository().openVault(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    { password: MASTER_PASSWORD },
  );
  return collectAllEntries(session.vault.rootGroup).map(({ entry }) => entry);
}

/**
 * Drives the built app itself — the real webview, the real Rust commands, a
 * real file on disk — through the one journey everything else hangs off:
 * open a vault, change it, and find the change still there after locking.
 * The unit tests run the same screens against fakes of everything Tauri
 * provides, so this is what catches the two halves disagreeing: a command
 * renamed on one side, a permission missing from the capability file, a path
 * the filesystem scope refuses.
 *
 * Windows only, like the app. Close Argus before running it: a second launch
 * hands over to the running one instead of starting.
 */
describe.skipIf(process.platform !== "win32")("Argus, end to end", () => {
  let folder: string;
  let vaultPath: string;
  let stopDriver: () => void;
  let restoreAppData: () => void;
  let app: WebDriverSession;

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), "argus-e2e-"));
    vaultPath = join(folder, "e2e-vault.kdbx");
    copyFileSync(fixturePath("kdbx4-argon2id.kdbx"), vaultPath);

    restoreAppData = isolateAppData();
    stopDriver = await startDriver();
    app = await WebDriverSession.start(DRIVER_URL, { application: appExecutable() });
  });

  afterAll(async () => {
    await app?.quit();
    stopDriver?.();
    restoreAppData?.();
    rmSync(folder, { recursive: true, force: true });
  });

  it("starts on the welcome screen when it has never opened a vault", async () => {
    await app.waitFor({ xpath: "//h1[normalize-space()='Open your vault']" });
  });

  it("asks for the master password of a vault opened from Explorer while it runs", async () => {
    // What double-clicking a .kdbx does while Argus is open: a second launch
    // with the file's path, which hands it to the running one and exits.
    // That also gets to the unlock screen without a native file dialog,
    // which WebDriver couldn't reach. (The driver can't pass the path to the
    // first launch itself: it turns every argument into a `--switch`.)
    execFileSync(appExecutable(), [vaultPath]);

    await app.waitFor(LOCKED_HEADING);

    expect(await app.text({ css: ".screen-heading p" })).toBe("e2e-vault.kdbx");
  });

  it("refuses the wrong master password", async () => {
    await app.fill(MASTER_PASSWORD_BOX, "not the password");
    await app.click(UNLOCK_BUTTON);

    expect(await app.text({ css: ".field-error" })).toContain("Incorrect password");
    expect(await app.exists(LOCK_BUTTON)).toBe(false);
  });

  it("unlocks with the right one and lists the vault's entries", async () => {
    await app.fill(MASTER_PASSWORD_BOX, MASTER_PASSWORD);
    await app.click(UNLOCK_BUTTON);

    await app.waitFor(LOCK_BUTTON);
    await app.waitFor(entryRow("Everything Entry"));
  });

  it("saves a new entry into the vault file, keeping a backup of the old one", async () => {
    const before = statSync(vaultPath).mtimeMs;

    await app.click({ xpath: "//button[normalize-space()='New Entry']" });
    await app.fill({ css: "#entry-title" }, NEW_ENTRY.title);
    await app.fill({ css: "#entry-username" }, NEW_ENTRY.username);
    await app.fill({ css: "#entry-password" }, NEW_ENTRY.password);
    await app.click({ xpath: "//button[@type='submit'][normalize-space()='Save']" });

    // The form closes onto the saved entry only once the file is written.
    await app.waitFor({ xpath: `//h1[normalize-space()='${NEW_ENTRY.title}']` });
    await app.waitFor(entryRow(NEW_ENTRY.title));

    expect(statSync(vaultPath).mtimeMs).toBeGreaterThan(before);
    expect(existsSync(`${vaultPath}.bak1`)).toBe(true);
    const saved = (await entriesOnDisk(vaultPath)).find((entry) => entry.title === NEW_ENTRY.title);
    expect(saved?.username).toBe(NEW_ENTRY.username);
    expect(saved?.password.reveal()).toBe(NEW_ENTRY.password);
  });

  it("leaves the entries KeePass wrote as they were", async () => {
    const titles = (await entriesOnDisk(vaultPath)).map((entry) => entry.title);

    expect(titles).toContain("Everything Entry");
    expect(titles).toContain("Edited In Argus");
  });

  it("locks, and shows the new entry again after unlocking from the file", async () => {
    await app.click(LOCK_BUTTON);
    await app.waitFor(LOCKED_HEADING);
    expect(await app.exists(entryRow(NEW_ENTRY.title))).toBe(false);

    await app.fill(MASTER_PASSWORD_BOX, MASTER_PASSWORD);
    await app.click(UNLOCK_BUTTON);

    await app.waitFor(entryRow(NEW_ENTRY.title));
  });
});
