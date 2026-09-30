# Release checklist

Pre-release assessment of Argus, based on a code review on 2026-09-27.

At the time of review, lint was clean and all 1,133 tests passed at 100% coverage. The items below are about behaviour and security defaults, not code quality.

# todo
upgrade KDBX3 to 4. option
## Release engineering

- [ ] **Code signing.** Without it, Windows SmartScreen will warn users off an unsigned password manager.
- [ ] **Updater.** There's no updater (`tauri-plugin-updater`), so security fixes can't reach users. It's much harder to add after people have installed the app.
- [x] **Release workflow.** The release is Windows-only. Pushing a `v*` tag runs CI, checks the tag matches the version in `tauri.conf.json`, builds the NSIS `.exe` and `.msi`, and attaches them to a **draft** GitHub Release with a `.sha256` file for each and a `SHA256SUMS.txt`. Review the draft on GitHub, then publish it.
- [x] **Round-trip tests on KeePass-written files.** `tests/fixtures/keepass/` holds vaults written by KeePass 2.61 itself (KDBX 3.1 with AES-KDF, KDBX 4.1 with Argon2id and ChaCha20, and one needing a key file), made by `scripts/generate-keepass-fixtures.ps1`. The tests check that everything Argus didn't edit comes back exactly as KeePass wrote it.
  - These found that kdbxweb writes two KDBX 4.1 dates (on custom data items and custom icons) in a form KeePass 2 rejects, so KeePass couldn't reopen such a vault after Argus saved it. It's fixed with a patch to kdbxweb in `patches/`. Worth reporting upstream.
- [x] **Dependency audits in CI.** `pnpm audit --audit-level moderate` and `cargo audit` now run on every PR, and so before every release.
- [x] **Build artifacts are no longer committed.** `*.tsbuildinfo`, `vite.config.js` and `vite.config.d.ts` are untracked and in `.gitignore`.
- [x] **`plan.md` references removed.** CLAUDE.md no longer points to it, and no longer lists Playwright.
- [ ] **Lock in the app identifier before release.** Changing `dev.argus.app` later moves the settings folder and loses users' recent-vault list. Also bump the version from `0.1.0` and write a changelog.
- [ ] **Manual KeePassXC check.** The automated fixtures come from KeePass 2, and files Argus saves from them reopen in KeePass 2. Still open a real KeePassXC vault (with attachments, TOTP and custom icons), edit and save it in Argus, then reopen it in KeePassXC.

## Already done well

- The Content-Security-Policy is strict, and nothing in the UI renders raw HTML (`innerHTML`, `dangerouslySetInnerHTML` or `eval`).
- Filesystem access is limited to files the user picked, and backup paths can only use the fixed backup suffixes.
- Saves are atomic, and a conflict check stops you overwriting changes made elsewhere.
- Screenshot and screen-capture protection is on by default.
- Random numbers come from `crypto.getRandomValues`.
- Fields Argus doesn't show are preserved, because the original KDBX document is edited in place.
