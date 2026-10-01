# Release checklist

Pre-release assessment of Argus, based on a code review on 2026-09-27.

At the time of review, lint was clean and all 1,133 tests passed at 100% coverage. The items below are about behaviour and security defaults, not code quality.

## Release engineering

- [ ] **Code signing.** Without it, Windows SmartScreen will warn users off an unsigned password manager.
- [ ] **Report the kdbxweb date bug upstream.** kdbxweb writes two KDBX 4.1 dates (on custom data items and custom icons) in a form KeePass 2 rejects, so KeePass couldn't reopen such a vault after Argus saved it. It's fixed here with a patch in `patches/`.
- [ ] **Lock in the app identifier before release.** Changing `dev.argus.app` later moves the settings folder and loses users' recent-vault list. Also write a changelog.
- [ ] **Manual KeePassXC check.** The automated fixtures come from KeePass 2, and files Argus saves from them reopen in KeePass 2. Still open a real KeePassXC vault (with attachments, TOTP and custom icons), edit and save it in Argus, then reopen it in KeePassXC.
- [x] fix eye icon for creating vault
- [] password matching tag didn't dissapear when they were matching
- arrow icon in passowrd generator
- is it a setting to turn off screensharing
- fix ctrl shift a

## Already done well

- The Content-Security-Policy is strict, and nothing in the UI renders raw HTML (`innerHTML`, `dangerouslySetInnerHTML` or `eval`).
- Filesystem access is limited to files the user picked, and backup paths can only use the fixed backup suffixes.
- Saves are atomic, and a conflict check stops you overwriting changes made elsewhere.
- Screenshot and screen-capture protection is on by default.
- Random numbers come from `crypto.getRandomValues`.
- Fields Argus doesn't show are preserved, because the original KDBX document is edited in place.
