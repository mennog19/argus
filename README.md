# Argus

A local-first desktop password manager. Tauri v2 + React + TypeScript, using `kdbxweb` to read and write standard `.kdbx` files so vaults stay portable to KeePass/KeePassXC and back.

See [`plan.md`](plan.md) for the development roadmap and [`CLAUDE.md`](CLAUDE.md) for project structure and conventions.

## Getting started (Windows)

Argus targets Windows (auto-type uses Win32 APIs). You need Node.js with pnpm for the frontend, and Rust with the MSVC C++ toolchain for the Tauri backend.

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
