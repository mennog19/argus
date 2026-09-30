//! Opening a vault from Explorer: the installer associates `.kdbx` with Argus,
//! so double-clicking one (or "Open with") launches Argus with the file's path
//! as its argument. A cold start remembers that path for the frontend to ask
//! for; a launch while Argus is already running is handed over by the
//! single-instance plugin and forwarded as an event.
//!
//! What the frontend does with the path (lock whatever is open and ask for the
//! new vault's master password) is decided in TypeScript; this side only finds
//! the path and lets `plugin-fs` read it.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_fs::FsExt;

/// The event emitted to the frontend, with the vault's path, when a launch
/// while Argus was already running asked it to open a vault.
pub const OPEN_VAULT_EVENT: &str = "open-vault";

/// The vault this process was launched to open, if any.
#[derive(Default)]
pub struct LaunchVault(OnceLock<String>);

/// The vault Argus was launched to open. Answers the same on every call, so a
/// remounted frontend doesn't lose it.
#[tauri::command]
pub fn launch_vault_path(state: State<'_, LaunchVault>) -> Option<String> {
    state.0.get().cloned()
}

/// Remembers the vault this process was launched with, for `launch_vault_path`.
pub fn remember_launch_vault(app: &AppHandle) {
    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    if let Some(path) = allow_vault_from_args(app, &args, &cwd) {
        let _ = app.state::<LaunchVault>().0.set(path);
    }
}

/// Forwards the vault a second launch was asked to open to the running one.
pub fn open_from_second_launch(app: &AppHandle, args: &[String], cwd: &str) {
    if let Some(path) = allow_vault_from_args(app, args, Path::new(cwd)) {
        let _ = app.emit(OPEN_VAULT_EVENT, path);
    }
}

/// Finds the vault in a launch's arguments and adds it to the filesystem
/// scope. Like a dialog pick, the path comes from the user acting through the
/// OS, never from the renderer; `persisted-scope` keeps the grant for when it
/// is reopened from the recent-vaults list.
fn allow_vault_from_args(app: &AppHandle, args: &[String], cwd: &Path) -> Option<String> {
    let path = vault_path_from_args(args, cwd)?;
    if !path.is_file() {
        return None;
    }
    app.fs_scope().allow_file(&path).ok()?;
    path.to_str().map(str::to_owned)
}

/// The first argument after the executable that isn't a flag, resolved
/// against `cwd`. Explorer passes an absolute path, which `join` keeps as is.
fn vault_path_from_args(args: &[String], cwd: &Path) -> Option<PathBuf> {
    let arg = args.iter().skip(1).find(|arg| !arg.starts_with('-'))?;
    Some(cwd.join(arg))
}

#[cfg(test)]
mod tests {
    use super::vault_path_from_args;
    use std::path::{Path, PathBuf};

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn finds_the_vault_path_after_the_executable() {
        let path = vault_path_from_args(
            &args(&["C:/Argus/argus.exe", "C:/vaults/mine.kdbx"]),
            Path::new("C:/Windows"),
        );

        assert_eq!(path, Some(PathBuf::from("C:/vaults/mine.kdbx")));
    }

    #[test]
    fn resolves_a_relative_path_against_the_working_directory() {
        let path = vault_path_from_args(&args(&["argus.exe", "mine.kdbx"]), Path::new("C:/vaults"));

        assert_eq!(path, Some(Path::new("C:/vaults").join("mine.kdbx")));
    }

    #[test]
    fn skips_flags() {
        let path = vault_path_from_args(
            &args(&["argus.exe", "--flag", "C:/vaults/mine.kdbx"]),
            Path::new("C:/"),
        );

        assert_eq!(path, Some(PathBuf::from("C:/vaults/mine.kdbx")));
    }

    #[test]
    fn finds_nothing_when_launched_without_a_file() {
        assert_eq!(
            vault_path_from_args(&args(&["argus.exe"]), Path::new("C:/")),
            None
        );
        assert_eq!(vault_path_from_args(&[], Path::new("C:/")), None);
    }
}
