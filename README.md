# Argus

A local-first desktop password manager. Argus reads and writes standard KeePass `.kdbx` files (KDBX3 and KDBX4), so your vault stays fully portable to [KeePass](https://keepass.info/) and [KeePassXC](https://keepassxc.org/) and back — no lock-in, no proprietary format. Built with Tauri v2, React, and TypeScript, with `kdbxweb` handling the KDBX crypto and format.

There is no account, no cloud sync, and no telemetry. Your vault file never leaves your device unless you move it yourself.

> **Status:** Argus is pre-1.0 and has not yet had an independent security audit. Review the [Security model](#security-model) and [Known limitations](#known-limitations) sections before trusting it with a production vault, and keep backups of any `.kdbx` file you open with it.

## Download

Grab the latest Windows installer from the [GitHub Releases page](https://github.com/mennog19/argus/releases/latest). Both an NSIS `.exe` and an `.msi` are published; either one installs the app.

Argus is currently **Windows-only** — auto-type relies on Win32 APIs with no cross-platform equivalent yet.

### Installing

1. Download the `.exe` or `.msi` from the release page.
2. Run the installer. Argus is **not code-signed**, so Windows SmartScreen will show *"Windows protected your PC"*. This is expected for an unsigned indie app, not a sign of tampering — click **More info**, then **Run anyway** to continue.
3. Follow the installer prompts. No admin rights or extra runtime installs are required on Windows 10/11 (the WebView2 runtime ships with the OS).

### Verifying your download

Each release includes SHA-256 checksums alongside the installers. To verify the file you downloaded hasn't been corrupted or tampered with, run:

```powershell
Get-FileHash .\Argus_<version>_x64-setup.exe -Algorithm SHA256
```

and compare the output against the matching `.sha256` value published with that release. A mismatch means don't run the installer — re-download it, and if it still mismatches, open an issue.

## Features

- **Vault management** — open, create, and save `.kdbx` files; edit groups, entries, and a recycle bin for soft-deleted items.
- **Entries** — title, username, password, URL, notes, tags, and arbitrary custom fields (including protected/hidden ones), matching KeePass conventions.
- **TOTP** — reads and generates time-based one-time codes stored using KeePassXC's TOTP conventions.
- **Search** — full-text search across title, username, URL, notes, tags, and custom fields.
- **Password generator** — configurable generation policy, with shared settings and a quick-generate action.
- **Password health check** — local-only detection of reused, weak, and fair-strength passwords across the vault. No online breach checking, and nothing ever leaves your device to compute it.
- **Auto-type** — an opt-in, off-by-default global hotkey that types a matching entry's credentials into whichever window is focused. Windows-only, and always confirmed through a picker that names the target window before anything is typed.
- **Clipboard auto-clear** — copied passwords are cleared from the clipboard automatically after a timeout.
- **Vault merge** — reconcile a vault that was edited from two places (e.g. after using it on two machines) with a guided merge wizard.
- **Settings transfer** — export/import app settings independently of any vault.

## KeePass / KeePassXC compatibility

Argus targets full KDBX3/KDBX4.

## Security model

- **Local-only, always.** Argus has no accounts, no sync service, and sends no telemetry. The only network request the app can ever make is an explicit, user-triggered "check for updates" that opens the GitHub Releases page in your browser — nothing happens automatically or in the background.
- **Master password and key files.** Vaults are unlocked with a master password, a KeePass/KeePassXC key file, or both. Argus remembers the *path* of the key file each recent vault was last unlocked with (never its contents). New vaults can optionally get a key file too, either generated in KeePassXC's format or an existing file of your choosing. There is no biometric unlock in v1.
- **Memory protection.** The app window uses OS-level content protection, and KDBX-protected fields (passwords, protected custom fields) follow `kdbxweb`'s in-memory protection conventions rather than being held as plain strings.
- **Clipboard handling.** Copying a password to the clipboard starts an auto-clear timer so the secret doesn't linger there indefinitely. The clear only happens if the clipboard still holds what Argus copied, so anything you copied since is left alone. A copied secret is also cleared when the vault closes or Argus quits, and on the next launch after a crash. On Windows, copies are kept out of clipboard history (Win+V) and cloud clipboard sync.
- **Auto-type caveats.** Auto-type simulates keystrokes into whatever window has focus, driven by Windows UI Automation to find the right fields directly (falling back to a Tab-count sequence only when it can't). It is off by default, opt-in, and always shows a picker confirming the target window before typing anything — but by nature it trusts that the focused window is the one you intend, so use it deliberately, and be aware that any other process capable of reading keystrokes/UI Automation on your machine could observe it, same as with any auto-type feature.
- **Unsigned binaries.** Releases are not code-signed (see [Verifying your download](#verifying-your-download) for how to confirm integrity via checksums instead).
- Argus has **not** had an independent third-party security audit yet.

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

# Rust (run from src-tauri/)
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

End-to-end tests use Playwright against the Vite dev server. They need a browser downloaded once:

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

MIT — see [`LICENSE`](LICENSE).
