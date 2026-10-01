# Argus

A local-first desktop password manager. Argus reads and writes standard KeePass `.kdbx` files (KDBX3 and KDBX4), so your vault stays fully portable to [KeePass](https://keepass.info/) and [KeePassXC](https://keepassxc.org/) and back — no lock-in, no proprietary format. Built with Tauri v2, React, and TypeScript, with `kdbxweb` handling the KDBX crypto and format.

There is no account, no cloud sync, and no telemetry. Your vault file never leaves your device unless you move it yourself.

> **Status:** Argus is pre-1.0 and has not yet had an independent security audit. Review the [Security model](#security-model) and [Known limitations](#known-limitations) sections before trusting it with a production vault, and keep backups of any `.kdbx` file you open with it.

## Download

Grab the latest Windows installer from the [GitHub Releases page](https://github.com/mennog19/argus/releases/latest). Both an NSIS `.exe` and an `.msi` are published; either one installs the app.

Argus is currently **Windows-only** — auto-type relies on Win32 APIs with no cross-platform equivalent yet.

### Installing

1. Download the `.exe` or `.msi` from the release page.
2. Run the installer. Argus is **not code-signed**, so Windows SmartScreen will show _"Windows protected your PC"_. This is expected for an unsigned indie app, not a sign of tampering — click **More info**, then **Run anyway** to continue.
3. Follow the installer prompts. No admin rights or extra runtime installs are required on Windows 10/11 (the WebView2 runtime ships with the OS).

### Verifying your download

Each release includes SHA-256 checksums alongside the installers. To verify the file you downloaded hasn't been corrupted or tampered with, run:

```powershell
Get-FileHash .\Argus_<version>_x64-setup.exe -Algorithm SHA256
```

and compare the output against the matching `.sha256` value published with that release. A mismatch means don't run the installer — re-download it, and if it still mismatches, open an issue.

## Features

- **Vault management** — open, create, and save `.kdbx` files; edit groups, entries, and a recycle bin for soft-deleted items.
- **KDBX4 upgrade** — a KDBX3 vault can be upgraded to KDBX4 from Settings, which switches its key derivation from AES-KDF to Argon2id. A copy of the KDBX3 file is kept next to the vault as `<vault>.kdbx3-backup.kdbx`, which later saves never rotate away.
- **Entries** — title, username, password, URL, notes, tags, and arbitrary custom fields (including protected/hidden ones), matching KeePass conventions. URLs can be typed without a scheme (`github.com/login`); they open as https.
- **Field references** — KeePass `{REF:…}` placeholders (such as the ones KeePassXC writes when you clone an entry with "reference username and password") are resolved when shown, copied, or auto-typed. The stored entry keeps the reference, so KeePass and KeePassXC still see it as a link.
- **Attachments** — files stored inside an entry are listed with their size and can be added, renamed, deleted, or saved back out to disk. Each change is saved straight away and counts as an edit, so the entry's history keeps the version before it.
- **Entry history** — every edit keeps the previous version, as in KeePass. Each entry lists its earlier versions with what changed, and any of them can be viewed, restored, or deleted, e.g. to purge an old password from the file.
- **TOTP** — reads and generates time-based one-time codes stored using KeePassXC's TOTP conventions.
- **Search** — full-text search across title, username, URL, notes, tags, and custom fields. Press **Ctrl+F** anywhere in an unlocked vault to jump to the search box.
- **Password generator** — random-character passwords with a configurable length and character sets, shared settings, and a quick-generate action.
- **Entry expiry** — the KDBX expiry date is shown and editable, and expired entries are flagged in the list and the health check. A setting decides what happens once an entry expires: keep it marked as expired (as KeePass does), move it to the recycle bin, or delete it permanently.
- **Password health check** — local-only detection of expired entries and of reused, weak, and fair-strength passwords across the vault. No online breach checking, and nothing ever leaves your device to compute it.
- **Vault settings** — the vault's name, how many earlier versions each entry keeps and how much space they may take, and its key-derivation settings (Argon2 memory, iterations and parallelism, or AES-KDF rounds) can be changed from Settings. KeePass and KeePassXC read the same settings.
- **Auto-type** — an opt-in, off-by-default global hotkey that types a matching entry's credentials into whichever window is focused. In a browser, entries are matched on the real address in the address bar rather than the page title. Windows-only, and always confirmed through a picker that names the target window before anything is typed.
- **Clipboard auto-clear** — copied passwords are cleared from the clipboard automatically after a timeout of up to 10 minutes.
- **Vault merge** — reconcile a vault that was edited from two places (e.g. after using it on two machines) with a guided merge wizard.
- **Settings transfer** — export/import app settings independently of any vault. An imported file can never turn screen-capture protection off; only you can, from the settings screen.
- **Update check** — opt-in and off by default. Once it's turned on in Settings, Argus asks GitHub for a newer release each time it starts and, if there is one, offers to install it. Nothing is installed until you say so.

## KeePass / KeePassXC compatibility

Argus targets full KDBX3/KDBX4 fidelity. It edits the original KDBX document in place rather than rebuilding it, so fields Argus doesn't show — auto-type settings, colours, custom data — are written back untouched. Attachments added in KeePass or KeePassXC keep their bytes and their memory-protection flag; ones added in Argus are stored the standard way, so both apps open them. Custom icons set in KeePass or KeePassXC are shown, and you can upload your own; they're stored in the vault as 128-pixel PNGs, so KeePass and KeePassXC show them too. TOTP secrets use KeePassXC's conventions, and `{REF:…}` field references are kept as references.

Vaults Argus creates use Argon2id with 64 MiB of memory, 4 iterations, and 2 lanes.

## Security model

- **Local-only, always.** Argus has no accounts, no sync service, and sends no telemetry. The only network request it makes of its own is the update check, which is off unless you turn it on. Opening an entry's URL hands it to your default browser.
- **Updates.** With the update check on, Argus fetches `latest.json` from the newest published GitHub Release once per launch. The request carries nothing about you or your vaults. Every installer is signed with Argus's updater key, and Argus refuses one whose signature doesn't match the public key built into it, so a tampered download never runs. Releases are only built from commits on `main`. Before the installer starts, Argus wipes any password it put on the clipboard. Installing closes Argus, so the vault is locked and needs its master password again afterwards. An imported settings file can't turn the update check on.
- **Master password and key files.** Vaults are unlocked with a master password, a KeePass/KeePassXC key file, or both. A new master password needs at least 8 characters, including a capital letter, a number, and a symbol. Existing vaults open with whatever password they already have. Argus remembers the _path_ of the key file each recent vault was last unlocked with (never its contents). New vaults can optionally get a key file too, either generated in KeePassXC's format or an existing file of your choosing, and an existing vault can have a key file added, swapped for another, or removed from Settings. Changing the password or the key file re-encrypts the vault's `.bak` backups to match. There is no biometric unlock in v1.
- **Memory protection.** The app window uses OS-level content protection, and KDBX-protected fields (passwords, protected custom fields) follow `kdbxweb`'s in-memory protection conventions rather than being held as plain strings.
- **Clipboard handling.** Copying a password to the clipboard starts an auto-clear timer so the secret doesn't linger there indefinitely. The clear only happens if the clipboard still holds what Argus copied, so anything you copied since is left alone. A copied secret is also cleared when the vault closes or Argus quits, and on the next launch after a crash. On Windows, copies are kept out of clipboard history (Win+V) and cloud clipboard sync.
- **Saved attachments.** Saving a copy of an attachment writes it to the place you pick, unencrypted. Argus doesn't track or clean up that copy, and never writes attachments to a temporary folder by itself.
- **Crafted files.** A vault's key-derivation settings are stored unencrypted in its header, so a malicious `.kdbx` could ask for enough Argon2 work to freeze or crash the app. Argus refuses to open a file that asks for more than 1 GiB of memory, 1000 iterations, or 64 lanes of Argon2, or more than a billion rounds of AES-KDF. The vault settings screen accepts nothing above the same limits, so Argus never writes a file it would then refuse.
- **Saving.** Saves are atomic: the vault is written to a new, randomly named temporary file next to it (`.<vault>.<random>.tmp`), flushed to disk, then renamed over the original. The temporary file is created fresh and never follows a symlink, and it's removed if the save fails. If Argus is killed mid-save, one stray temporary file can be left behind; it is safe to delete.
- **Auto-type caveats.** Auto-type simulates keystrokes into whatever window has focus, using Windows UI Automation to find the username and password fields. If it can't find them it types nothing. It is off by default, opt-in, and always shows a picker confirming the target window before typing anything.
  - A web page chooses its own title, so a phishing page can call itself "github.com – Sign in". For Chrome, Edge, Brave, Vivaldi, Opera, Firefox and Firefox forks, Argus reads the address bar instead: an entry with a URL is only offered when its host matches the page's address (or the page is on a subdomain of it). The picker warns when a page's title names entries its address rules out, and the address is checked again right before typing.
  - For other apps, and for a browser whose address bar can't be read, matching falls back to the window title. The picker marks those matches as "Title only" so you know to check the target yourself.
  - Any other process that can read keystrokes or UI Automation on your machine could observe auto-type, as with any auto-type feature.
- **Unsigned binaries.** Releases are not code-signed (see [Verifying your download](#verifying-your-download) for how to confirm integrity via checksums instead).
- Argus has **not** had an independent third-party security audit yet.

## Known limitations

- **Windows only.** Auto-type and the clipboard protections use Win32 APIs.
- **Updates need the check turned on.** With it off (the default), new versions have to be downloaded from the Releases page by hand. The check only runs at startup; there is no "check now" button.
- **Field references are read-only links.** Argus resolves `{REF:…}` placeholders but has no UI for creating them.
- **Attachments are for small files.** Argus refuses to attach a file over 10 MB, because the whole vault is rewritten on every save and each rolling backup holds a copy. Larger attachments added in KeePass or KeePassXC still load and are kept. Attachments can't be previewed or opened in place, only saved to disk.
- **Deleting an attachment doesn't purge it straight away.** The entry's history keeps the versions that held the file. Its bytes leave the vault once those versions are deleted too.
- **No biometric unlock, no browser extension, no breach checking.**

## Building from source

### 1. Install prerequisites

Argus targets Windows (auto-type uses Win32 APIs). You need Node.js with pnpm for the frontend, and Rust with the MSVC C++ toolchain for the Tauri backend.

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

The WebView2 runtime is also required, but Windows 10/11 already includes it.

> **Smart App Control:** if Rust builds fail with `An Application Control policy has blocked this file. (os error 4551)`, Windows 11 Smart App Control is blocking the unsigned build scripts and binaries that Rust compiles. There is no per-folder exception: the only fix is to turn it off under _Windows Security → App & browser control → Smart App Control_. Depending on your Windows version, turning it back on may require resetting Windows.

### 2. Install dependencies

```powershell
pnpm install --frozen-lockfile
```

### 3. Run the app

```powershell
pnpm tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and opens the Argus desktop window. The first run compiles all Rust dependencies, which takes a few minutes. Later runs are incremental.

### 4. Build a release

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

### 5. Publish a release

Releases are signed for the in-app updater. Once per repository, create a `release` environment that only `v*` tags may deploy to, and add the updater's private key to it as the `TAURI_SIGNING_PRIVATE_KEY` secret, plus its password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if it has one. The matching public key is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Keep the private key backed up: without it, installed copies can't be updated, and a new key only reaches users who reinstall by hand.

Bump `version` in `src-tauri/tauri.conf.json`, then push a matching tag. The tag has to point at a commit on `main`:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

The release workflow runs CI, builds and signs both installers, and attaches them to a draft GitHub Release with their SHA-256 checksums and the `latest.json` update feed. Review the draft and publish it. Users with the update check on are offered it from their next launch.

A local `pnpm tauri build` doesn't produce updater signatures and needs no key. To build signed installers the way the release does, set `TAURI_SIGNING_PRIVATE_KEY` and add `--ci --config src-tauri/tauri.release.conf.json`. Without `--ci`, a key with no password leaves the build waiting at a password prompt.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

MIT — see [`LICENSE`](LICENSE).
