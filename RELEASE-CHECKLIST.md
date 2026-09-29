# Release checklist

Pre-release assessment of Argus, based on a code review on 2026-09-27.

At the time of review, lint was clean and all 1,133 tests passed at 100% coverage. The items below are about behaviour and security defaults, not code quality.

## Should fix

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
