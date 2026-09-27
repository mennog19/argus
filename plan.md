# Argus — Development Plan

A local-first desktop password manager built on Tauri v2, TypeScript, and `kdbxweb`, reading and writing standard `.kdbx` files so vaults stay portable to KeePass/KeePassXC and back.

This plan is the checklist from empty repo to v1.0.0. It assumes the decisions below as fixed; see `CLAUDE.md` for the structural/coding conventions those decisions imply.

## Locked-in decisions (recap)

- **Stack**: Tauri v2 + TypeScript (domain/application/UI) + Rust (thin OS-integration shell only) + kdbxweb.
- **Fully local**: no accounts, sync, or telemetry, ever. The only network call in the whole app is an explicit, user-triggered "check for updates" that opens the GitHub Releases page — no background checks, no auto-download.
- **KDBX fidelity**: full KDBX3/KDBX4 round-trip, including custom fields, attachments, custom icons, entry history storage, and KeePassXC's TOTP/protected-field conventions — even before those features have UI.
- **Auth**: master password only for v1. No keyfile, no biometric unlock.
- **v1 feature scope**: vault open/create/edit/save, groups, tags, custom fields, recycle bin, password generator (shared settings + quick-generate), full-text search (title/username/URL/notes/tags/custom fields), local-only password health check (reused/weak/fair/strong, no age tracking).
- **Explicitly deferred** (own feature branches, post-v1): TOTP, attachments UI, entry history UI, keyfile/biometric unlock, opt-in online breach-check.
- **Auto-type** (reversed 2026-09-23): an opt-in, off-by-default global hotkey types a matching entry's credentials into whatever window is focused. Windows-only (`SendInput`), always confirmed through a picker that names the target window. Fields are found by UI Automation (the password field by its `IsPassword` flag, the username as the text box above it) and focused directly instead of counting Tabs; the sequence is only a fallback. This is the auto-type half of what was previously out of scope; a **browser extension remains out of scope, permanently**.
- **Explicitly out of scope, period**: browser extension / in-page autofill, import from non-KDBX sources, export to non-KDBX formats.
- **Testing**: TDD in spirit; **100% code coverage is the hard, CI-enforced gate**. Vitest for unit + component tests (mandatory), Playwright E2E + `cargo test` at a lighter smoke level.
- **Distribution**: Tauri bundler → unsigned Windows `.exe`/`.msi` (NSIS), published via GitHub Releases. No code signing, no Windows/Mac stores for now.
- **Process**: `feature/<name>` branches → PR (even solo) → squash-merge to `main`, GitHub Actions required check runs the full suite + coverage gate.

## Definition of Done (every feature branch)

A feature branch isn't done until:

1. Tests exist for every new domain/application/infrastructure/UI unit added, and coverage is 100%.
2. `pnpm lint` / `cargo clippy` pass with no warnings.
3. CI is green on the PR.
4. The PR is squash-merged into `main`.

## Release readiness (first public installer)

Goal: a user can download the Windows installer from GitHub Releases and use it. Each item is its own branch/PR per the workflow above.

### Blockers

- [ ] **Release workflow** — `.github/workflows/release.yml`, triggered on `v*` tags: build the NSIS `.exe` and `.msi`, attach them plus SHA-256 checksums to a GitHub Release. Fail if the tag doesn't match the app version.
- [ ] **Smoke-test an installed build on a clean Windows machine/VM** — open/create/save a vault, persisted file scope across restart, single-instance, auto-type hotkey, clipboard clearing, `contentProtected`, uninstall, and WebView2 bootstrap on a machine without it.

### Should do

- [ ] **Harden security config** — replace `"csp": null` in `tauri.conf.json` with a strict CSP; audit fs permissions and persisted scope; run `/security-review`.
- [x] **Verify vault saves are safe** — vault writes go through a Rust `write_file_atomic` command (temp file + `fsync` + rename, scope-checked), and the vault is serialized before the rolling backups rotate, so a crash or failed save can't corrupt a `.kdbx` or wipe older backups.
- [ ] **Align CI with `CLAUDE.md`** — add Playwright (`pnpm test:e2e`) to CI; run a full bundle (not `--no-bundle`) so installer failures surface before release time.
- [ ] **Rewrite `README.md`** — description, download link, install steps, SmartScreen "More info → Run anyway" note (unsigned), checksum verification, features, KeePass/KeePassXC compatibility, security model (local-only, no telemetry, auto-type caveats), known limitations, build from source.
- [ ] **Add a `LICENSE`.**
- [ ] **Pick and wire the first version** — `package.json`, `Cargo.toml`, and `tauri.conf.json` all say `0.1.0`; decide `v0.1.0` (pre-release) vs `v1.0.0` and bump together.
- [ ] **"Check for updates" button** — promised in the locked-in decisions but not implemented: explicit, user-triggered, opens the GitHub Releases page. Or drop it from the decisions above.
- [ ] **Commit or discard pending working-tree changes** (`plan.md`, `src-tauri/Cargo.toml`) before tagging.

### Nice to have

- [ ] `CHANGELOG.md` or auto-generated release notes.
- [ ] Known-limitations list in the README and release notes: Windows-only auto-type, no keyfile/biometric unlock, no TOTP/attachments/history UI yet.
- [ ] Tag `v0.1.0`, publish, and download the released artifact (not a local build) for a final sanity check.
