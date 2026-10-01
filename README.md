# Argus

A local-first desktop password manager for Windows. Argus reads and writes standard KeePass `.kdbx` files (KDBX 3 and KDBX 4), so your vault opens in [KeePass](https://keepass.info/) and [KeePassXC](https://keepassxc.org/) too, and theirs open in Argus.

There is no account, no cloud sync, and no telemetry. Your vault file never leaves your device unless you move it yourself.

> **Status:** Argus is pre-1.0 and has not had an independent security audit. Read the [Security model](#security-model) and [Known limitations](#known-limitations) before trusting it with your only copy of a vault, and keep backups of any `.kdbx` file you open with it.

## Download

Get the latest Windows installer from the [Releases page](https://github.com/mennog19/argus/releases/latest). Each release has an NSIS `.exe` and an `.msi`; either one installs the app.

### Installing

1. Download the `.exe` or the `.msi`.
2. Run it. Argus is **not code-signed**, so Windows SmartScreen shows _"Windows protected your PC"_. Click **More info**, then **Run anyway**. [Check the download](#verifying-your-download) first.
3. Follow the prompts. The `.exe` installs for your user account and needs no admin rights; the `.msi` installs for all users and asks for them.

Argus needs the WebView2 runtime, which is part of Windows 11 and of an up-to-date Windows 10. If it's missing, the installer downloads it from Microsoft.

### Verifying your download

Each release lists a SHA-256 checksum for every installer. To check the file you downloaded:

```powershell
Get-FileHash .\Argus_<version>_x64-setup.exe -Algorithm SHA256
```

Compare the output with the matching `.sha256` file on the release page. If they differ, don't run the installer: download it again, and open an issue if it still doesn't match.

## Features

### Vaults

- **Open, create and save `.kdbx` files**, by picking them in Argus or by double-clicking one in Explorer. Argus shows one vault at a time and remembers the last five.
- **Master password, key file, or both.** A new vault can get a key file generated in KeePassXC's format or use a file you already have. An open vault's password and key file can be changed from Settings.
- **Rolling backups.** Every save keeps the three previous versions of the file next to it, as `<vault>.kdbx.bak1` (newest) to `.bak3`.
- **Vault settings.** The vault's name, how much history each entry keeps, and its key-derivation settings (Argon2 memory, iterations and parallelism, or AES-KDF rounds) can be changed from Settings.
- **KDBX 4 upgrade.** A KDBX 3 vault can be upgraded from Settings, which moves its key derivation from AES-KDF to Argon2id. The KDBX 3 file is kept next to the vault as `<vault>.kdbx3-backup.kdbx`.
- **Merge.** A wizard reconciles a vault that was edited in two places, entry by entry.
- **Save conflicts.** If the file changed on disk since Argus read it, saving asks whether to overwrite it or drop your change rather than doing either silently.

### Entries

- **Fields.** Title, username, password, URL, notes, tags, an expiry date, and custom fields, which can be protected. URLs typed without a scheme (`github.com/login`) open as https.
- **Groups and a recycle bin.** Groups nest and can be reordered by dragging; entries can be dragged between them. Deleted entries and groups go to the recycle bin first.
- **Search** across title, username, URL, notes, tags and custom fields. **Ctrl+F** jumps to the search box, the arrow keys move through the results, and Esc clears the search.
- **TOTP.** Shows time-based one-time codes stored the way KeePassXC or the classic KeePass TOTP plugin stores them.
- **History.** Every edit keeps the previous version. Earlier versions can be viewed, restored, or deleted, for example to remove an old password from the file.
- **Attachments.** Files stored in an entry can be added, renamed, deleted, or saved to disk.
- **Icons.** Entries for known sites get the site's logo, and everything else a generated one. You can also pick from a built-in library or upload an image.
- **Field references.** KeePass `{REF:…}` placeholders are resolved when shown, copied, or auto-typed.
- **Expiry.** Expired entries are flagged. A setting decides what happens next: leave them marked (as KeePass does), move them to the recycle bin, or delete them.

### Passwords

- **Generator** for random passwords, with a configurable length and character sets.
- **Health check** that finds expired entries and reused, weak, and fair-strength passwords. It runs on your device; nothing is sent anywhere.
- **Clipboard auto-clear.** A copied secret is cleared after 20 seconds by default, and after at most 10 minutes.
- **Auto-type.** An opt-in global hotkey types a matching entry's username and password into the window you were in, after you confirm the entry in a picker that names the target window. In a browser, entries are matched on the address in the address bar, not the page title.

### App

- **Auto-lock** after a period of inactivity, when the window is minimized, when the computer sleeps, or when Windows is locked. Each is opt-in.
- **Screen-capture protection.** The window is excluded from screenshots, recordings and screen sharing unless you turn that off.
- **Keyboard shortcuts** for locking, copying, and editing, which [you can change](#keyboard-shortcuts).
- **Close to tray**, a dark and a light theme, and a choice of accent colour.
- **Settings export and import**, separate from any vault.
- **Update check**, opt-in. When it's on, Argus asks GitHub for a newer release each time it starts and offers to install it.

## Keyboard shortcuts

These work while the Argus window is focused and a vault is open.

| Shortcut     | Action                                  |
| ------------ | --------------------------------------- |
| Ctrl+F       | Search                                  |
| Ctrl+L       | Lock the vault                          |
| Ctrl+N       | New entry                               |
| Ctrl+E       | Edit the selected entry                 |
| Ctrl+S       | Save the entry being edited             |
| Delete       | Delete the selected entry (asks first)  |
| Ctrl+B       | Copy username                           |
| Ctrl+Shift+C | Copy password                           |
| Ctrl+T       | Copy authenticator code                 |
| Ctrl+U       | Copy URL                                |
| Ctrl+Shift+U | Open URL in the browser                 |
| Ctrl+H       | Show or hide the password               |
| Ctrl+G       | Open the password generator             |
| Ctrl+,       | Open settings                           |
| ↑ / ↓        | Move through the entry list             |
| Enter        | In the search box: select the first hit |

Copying the password is on Ctrl+Shift+C, not Ctrl+C, so that Ctrl+C keeps copying whatever text you have selected.

Every shortcut except Ctrl+F and the list keys can be changed under **Settings → Keyboard shortcuts**: click one and press the new combination. A shortcut that clashes with another one, with the auto-type hotkey, or with a standard editing key such as Ctrl+C is shown in red.

They can also be set in `settings.json` (see [Where Argus keeps things](#where-argus-keeps-things)), under `shortcuts`. Only the ones you change need to be listed:

```json
{
  "shortcuts": {
    "lock": "Control+Shift+L",
    "deleteEntry": "Control+Delete"
  }
}
```

The action names are `lock`, `newEntry`, `editEntry`, `saveEntry`, `deleteEntry`, `copyUsername`, `copyPassword`, `copyTotp`, `copyUrl`, `openUrl`, `togglePassword`, `openGenerator` and `openSettings`. A combination is any of `Control`, `Alt`, `Shift` and `Super` followed by one key, joined with `+`. Keys are letters, digits, `F1` to `F24`, and names such as `Delete`, `Insert`, `Space`, `Comma` or `ArrowUp`. An entry Argus can't read is ignored and that action keeps its default. Edit the file while Argus is closed.

## KeePass and KeePassXC compatibility

Argus edits the original KDBX document in place and doesn't rebuild it, so what Argus doesn't show (auto-type settings, colours, custom data) is written back untouched. The test suite round-trips vaults written by KeePass 2 itself to check this.

- Attachments added in KeePass or KeePassXC keep their bytes and their memory-protection flag.
- Custom icons from either app are shown. Icons uploaded in Argus are stored as 128-pixel PNGs, which both apps display.
- TOTP secrets use KeePassXC's conventions.
- `{REF:…}` field references stay references in the file.
- Vaults Argus creates use Argon2id with 64 MiB of memory, 4 iterations and 2 lanes.

## Where Argus keeps things

| What                             | Where                                           |
| -------------------------------- | ----------------------------------------------- |
| Your vault                       | Wherever you saved it                           |
| Its three rolling backups        | Next to it, as `.bak1`, `.bak2`, `.bak3`        |
| The KDBX 3 copy an upgrade keeps | Next to it, as `<vault>.kdbx3-backup.kdbx`      |
| App settings and recent vaults   | `%APPDATA%\nl.studiohelios.argus\settings.json` |

The settings file holds preferences, the paths of recently opened vaults, and the path of the key file each was last unlocked with. It never holds a password or a key file's contents. Uninstalling Argus leaves your vaults and their backups where they are.

## Security model

- **Local only.** No accounts, no sync service, no telemetry. The only network request Argus makes by itself is the update check, which is off unless you turn it on. Opening an entry's URL hands it to your default browser.
- **Encryption.** Argus adds no cryptography of its own: a vault is protected by the KDBX format's encryption and key derivation, through [kdbxweb](https://github.com/keeweb/kdbxweb) with Argon2 from [hash-wasm](https://github.com/Daninet/hash-wasm).
- **Master password and key files.** A new master password needs at least 8 characters, including a capital letter, a number, and a symbol. Existing vaults open with whatever password they have. Argus remembers the _path_ of the key file each recent vault was last unlocked with, never its contents. Changing the password or the key file re-encrypts the vault's `.bak` backups to match; a backup that can't be re-encrypted is deleted, and Argus tells you.
- **In memory.** Locking drops the decrypted vault, and unlocking reads the file again. While a vault is unlocked, its contents are in Argus's memory as ordinary strings. Argus runs in a webview, which can't pin or wipe memory, so it does not protect an unlocked vault from malware running under your account.
- **Locking.** Argus locks when you tell it to and when it quits. The auto-lock triggers are all off until you turn them on in Settings.
- **Screen capture.** The window is excluded from screenshots, recordings and screen sharing by default. An imported settings file can't turn that off.
- **Clipboard.** A copied secret is cleared after the timeout, when the vault closes, when Argus quits, and at the next launch after a crash. The clear only happens if the clipboard still holds what Argus copied. Copies are kept out of Windows clipboard history (Win+V) and cloud clipboard sync.
- **Saving.** Saves are atomic: the vault is written to a new, randomly named temporary file next to it (`.<vault>.<random>.tmp`), flushed to disk, then renamed over the original. If Argus is killed mid-save, one temporary file can be left behind; it is safe to delete.
- **Crafted files.** A vault's key-derivation settings sit unencrypted in its header, so a malicious `.kdbx` could ask for enough work to freeze the app. Argus refuses a file that asks for more than 1 GiB of memory, 1000 iterations, or 64 lanes of Argon2, or more than a billion rounds of AES-KDF, and won't write settings above those limits either.
- **Saved attachments.** Saving an attachment writes it, unencrypted, to the place you pick. Argus doesn't track or clean up that copy.
- **Updates.** With the update check on, Argus fetches `latest.json` from the newest GitHub Release once per launch. The request carries nothing about you or your vaults. Every installer is signed with Argus's updater key, and Argus refuses one whose signature doesn't match the public key built into it. Releases are only built from commits on `main`. Nothing is installed until you agree, and an imported settings file can't turn the check on.
- **Auto-type.** Auto-type sends keystrokes to another window, using Windows UI Automation to find the username and password fields. If it can't find them it types nothing.
  - A web page chooses its own title, so a phishing page can call itself "github.com – Sign in". For Chrome, Edge, Brave, Vivaldi, Opera, Firefox and Firefox forks, Argus reads the address bar instead: an entry with a URL is only offered when its host matches the page's address, or the page is on a subdomain of it. The picker warns when a page's title names entries its address rules out, and the address is checked again right before typing.
  - For other apps, and for a browser whose address bar can't be read, matching falls back to the window title. The picker marks those matches "Title only", so you know to check the target yourself.
  - Any process that can read keystrokes or UI Automation on your machine can observe auto-type, as with any auto-type feature.
- **Unsigned binaries.** Releases are not code-signed. [Verify your download](#verifying-your-download) by its checksum.

### Reporting a security issue

Please report vulnerabilities privately, through **Security → Report a vulnerability** on the GitHub repository, and not in a public issue.

## Known limitations

- **Windows only.** Auto-type and the clipboard protections use Win32 APIs.
- **One vault at a time.**
- **No import or export** of other formats, such as CSV. Vaults move in and out as `.kdbx` files.
- **No browser extension, no biometric unlock, no hardware keys, no breach checking.**
- **The generator makes random-character passwords only**, not passphrases.
- **Updates need the check turned on.** With it off (the default), new versions have to be downloaded by hand. The check runs at startup only; there is no "check now" button.
- **Field references can't be created in Argus**, only resolved.
- **Attachments are for small files.** Argus won't attach a file over 10 MB, because the whole vault is rewritten on every save and each backup holds a copy. Larger attachments added in KeePass or KeePassXC still load and are kept. Attachments can be saved to disk but not previewed.
- **Deleting an attachment doesn't remove it straight away.** The entry's history keeps the versions that held the file. Its bytes leave the vault once those versions are deleted too.

## Building from source

Argus is built with Tauri 2, React and TypeScript. You need Node.js with pnpm for the frontend, and Rust with the MSVC C++ toolchain for the backend.

### 1. Install prerequisites

All of these can be installed with `winget` from PowerShell. Some installers show a UAC prompt.

```powershell
# Node.js (22 or newer; CI uses 22)
winget install --id OpenJS.NodeJS.LTS -e

# Rust toolchain installer
winget install --id Rustlang.Rustup -e

# MSVC C++ build tools (required by Rust on Windows; large download)
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Open a **new** terminal so the updated `PATH` is picked up, then:

```powershell
# Stable Rust plus the components CI uses
rustup default stable
rustup component add rustfmt clippy

# pnpm 10 (the version the lockfile and CI use)
npm install -g pnpm@10
```

> **Smart App Control:** if Rust builds fail with `An Application Control policy has blocked this file. (os error 4551)`, Windows 11 Smart App Control is blocking the unsigned build scripts and binaries that Rust compiles. There is no per-folder exception: the only fix is to turn it off under _Windows Security → App & browser control → Smart App Control_. Depending on your Windows version, turning it back on may require resetting Windows.

### 2. Install dependencies

```powershell
pnpm install --frozen-lockfile
```

### 3. Run the app

```powershell
pnpm tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and opens the Argus window. The first run compiles all Rust dependencies, which takes a few minutes. Later runs are incremental.

### 4. Build

```powershell
pnpm tauri build              # executable + installers in src-tauri/target/release/bundle
pnpm tauri build --no-bundle  # executable only (what CI does)
```

### Checks

These match what CI runs:

```powershell
# Frontend
pnpm lint
pnpm test            # or pnpm test:coverage
pnpm audit --audit-level moderate
pnpm test:e2e        # drives the built app; see below

# Rust (run from src-tauri/)
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo audit          # install once with: cargo install cargo-audit --locked
```

`pnpm test:e2e` launches the real app and drives it through WebDriver: it opens a copy of a fixture vault, adds an entry, and checks the entry is in the file and still there after locking. It needs a release build (`pnpm tauri build --no-bundle`) and `tauri-driver` (`cargo install tauri-driver --locked`); the Edge WebDriver matching your WebView2 runtime is downloaded into `e2e/.drivers` on first use. Close Argus before running it. Your own app settings are set aside for the run and put back afterwards.

`cargo test` includes tests that copy to the real clipboard, so it replaces whatever your clipboard held.

The KDBX round-trip tests use vaults written by KeePass 2 itself, in `tests/fixtures/keepass/`. To regenerate them (needs KeePass 2.x installed):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-keepass-fixtures.ps1
```

## Releasing

Releases are signed for the in-app updater. Once per repository, create a `release` environment that only `v*` tags may deploy to, and add the updater's private key to it as the `TAURI_SIGNING_PRIVATE_KEY` secret, plus its password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if it has one. The matching public key is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Keep the private key backed up: without it, installed copies can't be updated, and a new key only reaches users who reinstall by hand.

Bump `version` in `src-tauri/tauri.conf.json`, then push a matching tag. The tag has to point at a commit on `main`:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

The release workflow runs CI, builds and signs both installers, and attaches them to a draft GitHub Release with their SHA-256 checksums and the `latest.json` update feed. Review the draft and publish it. Users with the update check on are offered it from their next launch.

A local `pnpm tauri build` doesn't produce updater signatures and needs no key. To build signed installers the way the release does, set `TAURI_SIGNING_PRIVATE_KEY` and add `--ci --config src-tauri/tauri.release.conf.json`. Without `--ci`, a key with no password leaves the build waiting at a password prompt.

## License

MIT. See [`LICENSE`](LICENSE).
