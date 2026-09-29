# Release checklist

Pre-release assessment of Argus, based on a code review on 2026-09-27.

At the time of review, lint was clean and all 1,133 tests passed at 100% coverage. The items below are about behaviour and security defaults, not code quality.

## Behaviour and security

- [x] **Ctrl+F focuses the search box.** Works from any view of an unlocked vault (and from the recycle bin, which switches to All Items). It does nothing while a merge is in progress.
- [x] **URLs without a scheme open.** `github.com/login` opens as `https://github.com/login`. The URL is still stored as typed.
- [x] **`{REF:…}` placeholders are resolved.** Resolved in the entry list, entry detail, copy and auto-type. Editing still shows the reference, so it's saved back unchanged. Entries whose password is a reference are left out of the health report.
- [x] **Passphrase (wordlist) generator removed.** Settings saved with the old passphrase options fall back to character mode.
- [x] **README updated.** Also fixed claims that were wrong: there's no "check for updates" feature, no Tab-order fallback in auto-type, and no Playwright setup. Added the missing "Known limitations" section.
- [x] **Auto-type matches on the real address.** For Chromium- and Firefox-family browsers, the address bar is read through UI Automation. An entry with a URL is only offered when its host matches the page's address. The picker warns when a page's title names entries that its address rules out, and the address is checked again just before typing. Title-only matches are labelled as such.
- [x] **Master password rules.** At least 8 characters, with a capital letter, a number and a symbol. This applies when creating a vault or changing its password; existing vaults are unaffected.
- [x] **KDF sanity limit.** Opening a file is refused if it asks for more than 1 GiB of Argon2 memory, 1000 iterations or 64 lanes. AES-KDF (KDBX3) isn't capped, because kdbxweb has no hook for it. It can only make unlocking slow, not crash the app.
- [x] **Settings upper limits.** Clipboard clear is capped at 600 s and the idle timeout at 1440 min, in the settings screen, the local settings file and imports. An import can no longer turn screen-capture protection off: it stays on, and the import message says so.
- [x] **Temporary save file.** It's now `.<vault>.<random 64-bit>.tmp`, created with `create_new`, so it never opens an existing file or follows a symlink.
  - _Where do these files go?_ Next to the vault, on purpose: a rename is only atomic within one folder or filesystem, so the temp file can't live anywhere else.
  - _Is there a limit on them?_ Only one exists per save in progress, and it's deleted when the save finishes or fails. A leftover can only appear if Argus is killed in the middle of a save. That leaves one stray file per crash, safe to delete. Nothing accumulates in normal use.

## Release engineering

- [ ] **Code signing.** Without it, Windows SmartScreen will warn users off an unsigned password manager.
- [ ] **Updater.** There's no updater (`tauri-plugin-updater`), so security fixes can't reach users. It's much harder to add after people have installed the app.
- [ ] **Release workflow.** CI builds with `--no-bundle` on Windows only, but `bundle.targets` is `"all"`. Also:
  - Decide whether this release is Windows-only. Auto-type only works on Windows.
  - Add a tag-triggered workflow that builds the installers and attaches them to a GitHub Release, with checksums.
- [ ] **Playwright E2E tests don't exist.** CLAUDE.md lists them as a CI step, but there's no test directory, config, or CI job. At minimum, cover the create → add entry → lock → unlock flow.
- [ ] **No `cargo audit` in CI.** Add it, along with `pnpm audit`.
- [ ] **Build artifacts are committed.** Remove `tsconfig.tsbuildinfo`, `tsconfig.node.tsbuildinfo`, `vite.config.js` and `vite.config.d.ts` from git and add them to `.gitignore`.
- [ ] **`plan.md` is missing.** CLAUDE.md refers to it, but it isn't in the repo.
- [ ] **Lock in the app identifier before release.** Changing `dev.argus.app` later moves the settings folder and loses users' recent-vault list. Also bump the version from `0.1.0` and write a changelog.
- [ ] **Manual fidelity check.** Open a real KeePassXC vault (with attachments, TOTP and custom icons), edit and save it in Argus, then reopen it in KeePassXC.

## Already done well

- The Content-Security-Policy is strict, and nothing in the UI renders raw HTML (`innerHTML`, `dangerouslySetInnerHTML` or `eval`).
- Filesystem access is limited to files the user picked, and backup paths can only use the fixed backup suffixes.
- Saves are atomic, and a conflict check stops you overwriting changes made elsewhere.
- Screenshot and screen-capture protection is on by default.
- Random numbers come from `crypto.getRandomValues`.
- Fields Argus doesn't show are preserved, because the original KDBX document is edited in place.
