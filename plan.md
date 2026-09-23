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
- **Explicitly out of scope, period**: browser extension/autofill, auto-type/global input simulation, import from non-KDBX sources, export to non-KDBX formats.
- **Testing**: TDD in spirit; **100% code coverage is the hard, CI-enforced gate**. Vitest for unit + component tests (mandatory), Playwright E2E + `cargo test` at a lighter smoke level.
- **Distribution**: Tauri bundler → unsigned Windows `.exe`/`.msi` (NSIS), published via GitHub Releases. No code signing, no Windows/Mac stores for now.
- **Process**: `feature/<name>` branches → PR (even solo) → squash-merge to `main`, GitHub Actions required check runs the full suite + coverage gate.

## Definition of Done (every feature branch)

A feature branch isn't done until:

1. Tests exist for every new domain/application/infrastructure/UI unit added, and coverage is 100%.
2. `pnpm lint` / `cargo clippy` pass with no warnings.
3. CI is green on the PR.
4. The PR is squash-merged into `main`.

## Todo

- Opt-in, off-by-default online breach-check (HIBP-style).
- import en export functionaliteit voor settings
- autofill
- stats schermpje?
