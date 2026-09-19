# Argus — Development Plan

A local-first desktop password manager built on Tauri v2, TypeScript, and `kdbxweb`, reading and writing standard `.kdbx` files so vaults stay portable to KeePass/KeePassXC and back.

This plan is the checklist from empty repo to v1.0.0. It assumes the decisions below as fixed; see `CLAUDE.md` for the structural/coding conventions those decisions imply.

## Locked-in decisions (recap)

- **Stack**: Tauri v2 + TypeScript (domain/application/UI) + Rust (thin OS-integration shell only) + kdbxweb.
- **Fully local**: no accounts, sync, or telemetry, ever. The only network call in the whole app is an explicit, user-triggered "check for updates" that opens the GitHub Releases page — no background checks, no auto-download.
- **KDBX fidelity**: full KDBX3/KDBX4 round-trip, including custom fields, attachments, custom icons, entry history storage, and KeePassXC's TOTP/protected-field conventions — even before those features have UI.
- **Auth**: master password only for v1. No keyfile, no biometric unlock.
- **v1 feature scope**: vault open/create/edit/save, groups, tags, custom fields, recycle bin, password generator (shared settings + quick-generate), full-text search (title/username/URL/notes/tags/custom fields), local-only password health check (duplicates/weak/stale).
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

---

## Phase 0 — Project Scaffolding

Not a "feature" in the product sense — one setup branch (`chore/scaffolding`) to get an empty, testable, CI-green skeleton before any domain code exists.

- [x] Init Tauri v2 project (`pnpm create tauri-app`), TypeScript template. (React chosen as the UI library — wasn't nailed down during planning, flagged and defaulted.)
- [x] Add `kdbxweb` dependency.
- [x] Create the layered TS structure: `src/domain/`, `src/application/`, `src/infrastructure/`, `src/ui/`.
- [x] Configure Vitest + coverage (v8/istanbul), fail-under-100 threshold wired in.
- [x] Configure Testing Library for component tests.
- [x] Configure Playwright, pointed at the Vite dev server (same UI code Tauri renders; native-window E2E via `tauri-driver` deferred until there's a real window to drive).
- [x] Confirm `cargo test` runs cleanly on the default `src-tauri` scaffold.
- [x] Configure ESLint + Prettier for TS; confirm `rustfmt`/`clippy` defaults for Rust.
- [x] Add GitHub Actions workflow: install → lint → `pnpm test -- --coverage` (gate at 100%) → `cargo test` → Playwright → build, required on PRs into `main`.
- [x] Fix CI `build` job failure: `tsc` couldn't see `@testing-library/jest-dom`'s matcher type augmentation because `vitest.setup.ts` lived outside `tsconfig.json`'s `include: ["src"]`. Moved it to `src/vitest.setup.ts` (updated `vitest.config.ts` setup/coverage-exclude paths to match).
- [X] Branch protection on `main`: require the CI check, require PR review (or at least PR existence) before merge, squash-merge only. **Blocked on you** — needs your GitHub login, I can't set this via API without `gh` authenticated.
- [x] Write `CLAUDE.md` and keep it updated as structure solidifies.
- [X] Open and merge the `chore/scaffolding` PR: https://github.com/mennog19/argus/pull/new/chore/scaffolding — pushed and CI-verified locally, waiting on you to open it (no `gh` auth on this machine).

## Phase 1 — Core Domain & Vault I/O

Pure domain logic first (no Tauri, no UI) — this is where DDD and TDD matter most.

- [x] `feature/vault-domain-model`: `Vault` aggregate root, `Group` (nested), `Entry`, value objects for fields (title/username/password/URL/notes/tags/custom fields). No persistence — pure in-memory model with full unit test coverage. Merged via PR #2.
- [x] `feature/password-policy`: domain rules for password generation constraints (length, character sets, passphrase mode) and for the local health checks (duplicate/weak/stale detection logic), as pure functions/value objects. Merged via PR #3.
- [x] `feature/kdbx-repository`: infrastructure layer wrapping `kdbxweb` behind a repository interface defined in `domain`/`application` — `openVault(bytes, masterPassword)`, `saveVault(vault)`. Merged via PR #4. Note: the round-trip test fixture is a `.kdbx` file generated in-test via `kdbxweb` itself (KDBX4/Argon2), not a file produced by a real KeePass/KeePassXC install — none was available on this machine. Worth swapping in an actual KeePassXC-exported file before relying on this for real compatibility claims.
- [ ] `feature/vault-unlock-create`: application layer — open an existing `.kdbx` with a master password, create a brand-new vault with a chosen master password. Wired to Tauri's file-open dialog via the Rust shell. **Implemented, not yet merged** — `VaultAccessService` (application) orchestrates the open/create flows against new `FileStorage`/`VaultFileDialog` ports and `VaultRepository.createVault`; `TauriFileStorage`/`TauriVaultFileDialog` (infrastructure) implement those ports on `@tauri-apps/plugin-fs`/`@tauri-apps/plugin-dialog`, with the Rust shell just registering the two plugins and granting minimal capabilities (dialog-picked paths are auto-scoped for fs access). 100% coverage/lint/typecheck/`cargo clippy`/`cargo test`/build all passing locally; pushed to `origin/feature/vault-unlock-create` — needs PR open (https://github.com/mennog19/argus/pull/new/feature/vault-unlock-create) + CI + squash-merge. Not wired into any UI yet — that's `feature/main-shell-ui` in Phase 2.

## Phase 2 — Application Shell & UI
Please follow the following designs: https://claude.ai/artifact/HQfkEAWzuNDjJyhyT9njxS

- [ ] `feature/app-settings`: local JSON settings file (theme, auto-lock timeouts, recent-files list) in the OS app-data dir via Tauri's path API; read/write service in `infrastructure`.
- [ ] `feature/main-shell-ui`: main window shell per the design — navigation, unlock screen, empty/locked states. Recent-files list wired to `app-settings`.
- [ ] `feature/entry-list-detail-ui`: browse groups, view entry details, read-only first.
- [ ] `feature/single-instance-lock`: Rust shell enforces one running instance; second launch focuses the existing window instead of opening a duplicate.

## Phase 3 — Entry Management

- [ ] `feature/entry-crud`: create/edit/delete entries and groups (including nested groups), tags, custom fields — full read/write through the domain model and repository.
- [ ] `feature/recycle-bin`: soft-delete for entries/groups instead of hard delete; restore and permanent-empty actions.
- [ ] `feature/search`: search across title/username/URL/notes/tags/custom field keys and values.
- [ ] `feature/password-generator`: dedicated generator settings screen (length, character-set toggles, exclude-ambiguous, passphrase mode) per the design; "generate for new entry" reuses the same settings.

## Phase 4 — Security & Data Safety

- [ ] `feature/auto-lock`: idle timeout, lock on minimize, lock on OS sleep — each independently configurable in settings.
- [ ] `feature/clipboard-security`: copy username/password to clipboard, auto-clear after a configurable delay.
- [ ] `feature/save-data-safety`: rolling backups (last 3 copies) on every save; pre-save modified-time check that warns instead of silently overwriting when the file changed on disk since it was opened/last saved.
- [ ] `feature/password-health-check`: local, offline view flagging duplicate, weak, and stale passwords across the open vault.

## Phase 5 — Polish & Distribution

- [ ] `feature/update-check`: manual "check for updates" action, compares current version against the latest GitHub Release, opens the release page if newer — no auto-download.
- [ ] `feature/packaging`: Tauri bundler config for a Windows `.exe`/`.msi` (NSIS) artifact; GitHub Actions job to attach the built installer to a GitHub Release on tag push.
- [ ] Accessibility pass: keyboard navigation through every flow (unlock, browse, edit, generate, search), ARIA labels on interactive elements — no formal audit, just a working keyboard-first pass.

## Phase 6 — Pre-Release Checklist

- [ ] Full manual walkthrough of every v1 flow against the design.
- [ ] Confirm coverage is 100% across `domain`/`application`/`infrastructure`/`ui` and CI is green on `main`.
- [ ] Decide license (deferred, yours to pick) and add `LICENSE` if/when repo visibility changes.
- [ ] Tag `v1.0.0`, cut the GitHub Release, verify the attached installer runs a real open → create entry → save → reopen round-trip on a clean Windows machine.

## v1.0.0 Release

Ship it.

---

## Backlog (explicitly deferred, not v1 — future feature branches)

- TOTP code generation and display.
- File attachments on entries.
- Entry history UI (KDBX already stores it; v1 just doesn't expose it).
- Keyfile-based unlock; OS biometric (Windows Hello) convenience unlock.
- Opt-in, off-by-default online breach-check (HIBP-style).
- Code signing (Windows Authenticode, macOS notarization) ahead of any wider release.
- macOS/Linux distribution channels (builds already work via Tauri; only Windows is an active release target for now).

## Out of scope, period

- Browser extension / autofill / native messaging.
- Auto-type / global keystroke simulation into other apps.
- Import from non-KDBX sources.
- Export to non-KDBX formats.
