# Release checklist

Pre-release assessment of Argus, based on a code review on 2026-09-27.

At the time of review, lint was clean and all 1,133 tests passed at 100% coverage. The items below are about behaviour and security defaults, not code quality.

## Must fix before release

- [x] **New vaults use very weak key-derivation settings.** `Kdbx.create()` falls back to kdbxweb's defaults: Argon2d with only **1 MiB memory and 2 iterations** ([kdbx-vault-repository.ts](src/infrastructure/kdbx-vault-repository.ts#L60-L64)). KeePassXC uses Argon2id with about 64 MiB and roughly 1 second of work. If someone steals the `.kdbx` file, they can guess master passwords very quickly. Set Argon2id with sensible memory and iterations when creating a vault, and ideally when changing the master password too.
- [x] **Emptying the recycle bin doesn't actually delete anything.** Confirmed with a throwaway test. kdbxweb's `db.remove()` moves an item into the recycle bin, so for an item that's already there it does nothing. The UI shows the bin as empty, but the entries are still in the saved file ([kdbx-mapper.ts](src/infrastructure/kdbx-mapper.ts#L318-L325)). When the item is already in the bin, call `db.move(obj, undefined)` so it is really deleted and recorded as deleted. Add a round-trip test for this.
- [x] **Locking doesn't clear the decrypted vault from memory.** `lock()` only changes the screen ([App.tsx](src/ui/App.tsx#L111)). `VaultAccessService.session` keeps holding the open `Kdbx` document, including all the decrypted secrets, until another vault is opened. Add a `closeVault()` that drops the session and call it when locking.
- [ ] **Auto-lock is completely off by default** ([settings.ts](src/application/settings.ts#L17)). That's an unusual default for a password manager. Consider an idle timeout of around 10–15 minutes and lock-on-sleep enabled by default.
<<<<<<< HEAD
- [ ] **A dependency has known security issues.** `pnpm audit` reports 15 vulnerabilities (13 high), all in `@xmldom/xmldom` 0.8.x, which comes in through `kdbxweb`. Merging a vault file from somewhere else runs it through that XML parser. Fix it with a `pnpm.overrides` entry pinning `@xmldom/xmldom` to `>=0.8.15`.
- [x] **Anyone can create a vault with a 1-character master password.** The only check was that it wasn't empty. Creating a vault and changing the master password now both require at least 12 characters (`MASTER_PASSWORD_MIN_LENGTH`, matching the health policy's weak-password length) and show the same weak/fair/strong meter as the entry form. Only length is enforced, so a long lowercase passphrase is still accepted.
=======
- [x] **A dependency has known security issues.** `pnpm audit` reported 15 vulnerabilities (13 high), all in `@xmldom/xmldom` 0.7.13, which comes in through `kdbxweb` (it declares `^0.7.4`, and no 0.7.x release has the fixes). Fixed with an `overrides` entry in `pnpm-workspace.yaml` pinning `@xmldom/xmldom` to `^0.8.15` (pnpm 12 no longer reads the `pnpm` field in `package.json`). kdbxweb only falls back to xmldom when there is no global `DOMParser`, so the Tauri webview normally uses its built-in parser anyway.
- [ ] **Anyone can create a vault with a 1-character master password.** The only check is that it isn't empty ([WelcomeScreen.tsx](src/ui/screens/WelcomeScreen.tsx#L57)). Add a minimum length and/or a strength meter; the password-health code can probably provide one.
>>>>>>> b6b77558debd387cabc9f570249240cd8b35fea6

## Should fix

- [ ] **Clipboard clearing can wipe the user's own clipboard.** After the countdown it always writes `""`, even if the user has copied something else since ([use-clipboard-copy.ts](src/ui/use-clipboard-copy.ts#L79)). There are also two gaps:
  - It doesn't clear when the app is quit or crashes.
  - Copied passwords end up in Windows clipboard history (Win+V) and cloud clipboard. Excluding them needs a small Rust command that sets the `ExcludeClipboardContentFromMonitorProcessing` format.
- [ ] **Old backups can still be opened with the old master password.** After a master password change, the `.bak1–3` files are still encrypted with the old one. If the change was because the old password leaked, those backups are still exposed. Either delete or rotate them, or warn the user in the UI.
- [ ] **Auto-type can type into the wrong page.** It types into the window captured when the hotkey was pressed, but doesn't check the window title again just before typing ([auto_type.rs](src-tauri/src/auto_type.rs#L429)). If the browser tab changes in the meantime, credentials go into the wrong page. Compare the title again before sending any keystrokes.
- [ ] **Entry history grows forever.** `pushHistory()` runs on every edit, but `meta.historyMaxItems` and `historyMaxSize` are never applied, so vaults keep getting bigger.
- [ ] **The settings file isn't validated when it's loaded.** [json-settings-store.ts](src/infrastructure/json-settings-store.ts#L22) just casts `JSON.parse` to `AppSettings`. A file like `{}` would leave `recentVaults` undefined and crash startup. Run it through the same validation the settings import uses, or merge it with the defaults.
- [ ] **Key files aren't supported.** Vaults protected with a KeePass/KeePassXC key file can't be opened. Either support them or say so clearly in the README and in the error message.

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

## Minor

- [ ] The password generator's `% maxExclusive` has a negligible modulo bias (about 1e-8). Rejection sampling would make the "uniform" doc comment strictly true.
- [ ] `emptyRecycleBin` rebuilds the bin `Group` without its icon, which may reset the bin's icon on save.

## Already done well

- The Content-Security-Policy is strict, and nothing in the UI renders raw HTML (`innerHTML`, `dangerouslySetInnerHTML` or `eval`).
- Filesystem access is limited to files the user picked, and backup paths can only use the fixed backup suffixes.
- Saves are atomic, and a conflict check stops you overwriting changes made elsewhere.
- Screenshot and screen-capture protection is on by default.
- Random numbers come from `crypto.getRandomValues`.
- Fields Argus doesn't show are preserved, because the original KDBX document is edited in place.
