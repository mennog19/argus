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
- **Entries** — title, username, password, URL, notes, tags, and arbitrary custom fields (including protected/hidden ones), matching KeePass conventions. URLs can be typed without a scheme (`github.com/login`); they open as https.
- **Field references** — KeePass `{REF:…}` placeholders (such as the ones KeePassXC writes when you clone an entry with "reference username and password") are resolved when shown, copied, or auto-typed. The stored entry keeps the reference, so KeePass and KeePassXC still see it as a link.
- **TOTP** — reads and generates time-based one-time codes stored using KeePassXC's TOTP conventions.
- **Search** — full-text search across title, username, URL, notes, tags, and custom fields. Press **Ctrl+F** anywhere in an unlocked vault to jump to the search box.
- **Password generator** — random-character passwords with a configurable length and character sets, shared settings, and a quick-generate action.
- **Password health check** — local-only detection of reused, weak, and fair-strength passwords across the vault. No online breach checking, and nothing ever leaves your device to compute it.
- **Auto-type** — an opt-in, off-by-default global hotkey that types a matching entry's credentials into whichever window is focused. In a browser, entries are matched on the real address in the address bar rather than the page title. Windows-only, and always confirmed through a picker that names the target window before anything is typed.
- **Clipboard auto-clear** — copied passwords are cleared from the clipboard automatically after a timeout of up to 10 minutes.
- **Vault merge** — reconcile a vault that was edited from two places (e.g. after using it on two machines) with a guided merge wizard.
- **Settings transfer** — export/import app settings independently of any vault. An imported file can never turn screen-capture protection off; only you can, from the settings screen.

## KeePass / KeePassXC compatibility

Argus targets full KDBX3/KDBX4 fidelity. It edits the original KDBX document in place rather than rebuilding it, so fields Argus doesn't show — attachments, custom icons, entry history, custom data — are written back untouched. TOTP secrets use KeePassXC's conventions, and `{REF:…}` field references are kept as references.

Vaults Argus creates use Argon2id with 64 MiB of memory, 4 iterations, and 2 lanes.

## Security model

- **Local-only, always.** Argus has no accounts, no sync service, and sends no telemetry. The app makes no network requests of its own. Opening an entry's URL hands it to your default browser.
- **Master password and key files.** Vaults are unlocked with a master password, a KeePass/KeePassXC key file, or both. A new master password needs at least 8 characters, including a capital letter, a number, and a symbol. Existing vaults open with whatever password they already have. Argus remembers the _path_ of the key file each recent vault was last unlocked with (never its contents). New vaults can optionally get a key file too, either generated in KeePassXC's format or an existing file of your choosing. There is no biometric unlock in v1.
- **Memory protection.** The app window uses OS-level content protection, and KDBX-protected fields (passwords, protected custom fields) follow `kdbxweb`'s in-memory protection conventions rather than being held as plain strings.
- **Clipboard handling.** Copying a password to the clipboard starts an auto-clear timer so the secret doesn't linger there indefinitely. The clear only happens if the clipboard still holds what Argus copied, so anything you copied since is left alone. A copied secret is also cleared when the vault closes or Argus quits, and on the next launch after a crash. On Windows, copies are kept out of clipboard history (Win+V) and cloud clipboard sync.
- **Crafted files.** A vault's key-derivation settings are stored unencrypted in its header, so a malicious `.kdbx` could ask for enough Argon2 work to freeze or crash the app. Argus refuses to open a file that asks for more than 1 GiB of memory, 1000 iterations, or 64 lanes.
- **Saving.** Saves are atomic: the vault is written to a new, randomly named temporary file next to it (`.<vault>.<random>.tmp`), flushed to disk, then renamed over the original. The temporary file is created fresh and never follows a symlink, and it's removed if the save fails. If Argus is killed mid-save, one stray temporary file can be left behind; it is safe to delete.
- **Auto-type caveats.** Auto-type simulates keystrokes into whatever window has focus, using Windows UI Automation to find the username and password fields. If it can't find them it types nothing. It is off by default, opt-in, and always shows a picker confirming the target window before typing anything.
  - A web page chooses its own title, so a phishing page can call itself "github.com – Sign in". For Chrome, Edge, Brave, Vivaldi, Opera, Firefox and Firefox forks, Argus reads the address bar instead: an entry with a URL is only offered when its host matches the page's address (or the page is on a subdomain of it). The picker warns when a page's title names entries its address rules out, and the address is checked again right before typing.
  - For other apps, and for a browser whose address bar can't be read, matching falls back to the window title. The picker marks those matches as "Title only" so you know to check the target yourself.
  - Any other process that can read keystrokes or UI Automation on your machine could observe auto-type, as with any auto-type feature.
- **Unsigned binaries.** Releases are not code-signed (see [Verifying your download](#verifying-your-download) for how to confirm integrity via checksums instead).
- Argus has **not** had an independent third-party security audit yet.

## Known limitations

- **Windows only.** Auto-type and the clipboard protections use Win32 APIs.
- **No updater yet.** New versions have to be downloaded from the Releases page by hand.
- **Field references are read-only links.** Argus resolves `{REF:…}` placeholders but has no UI for creating them.
- **AES-KDF isn't capped.** The key-derivation limits above cover Argon2 (KDBX4). A KDBX3 file using AES-KDF with a huge round count can still make unlocking very slow.
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

# Rust (run from src-tauri/)
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo audit          # install once with: cargo install cargo-audit --locked
```

The KDBX round-trip tests use vaults written by KeePass 2 itself, in `tests/fixtures/keepass/`. To regenerate them (needs KeePass 2.x installed):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-keepass-fixtures.ps1
```

### 5. Publish a release

Bump `version` in `src-tauri/tauri.conf.json`, then push a matching tag:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

The release workflow runs CI, builds both installers, and attaches them with their SHA-256 checksums to a draft GitHub Release. Review the draft and publish it.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

MIT — see [`LICENSE`](LICENSE).
