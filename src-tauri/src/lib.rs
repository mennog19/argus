mod atomic_write;
mod auto_type;

use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// Rolling-backup suffixes `VaultAccessService` rotates next to a vault; the
/// only paths `grant_file_access` is willing to widen scope to.
const ALLOWED_BACKUP_SUFFIXES: [&str; 3] = [".bak1", ".bak2", ".bak3"];

/// Appends `suffix` to `anchor`, but only when `suffix` is one of the fixed
/// rolling-backup suffixes. A plain function (no `AppHandle`) so the
/// allow-list check is unit-testable without a running Tauri app.
fn derive_backup_path(anchor: &str, suffix: &str) -> Result<String, String> {
    if !ALLOWED_BACKUP_SUFFIXES.contains(&suffix) {
        return Err(format!("unsupported backup suffix: {suffix}"));
    }
    Ok(format!("{anchor}{suffix}"))
}

/// Adds `anchor`'s `.bak1`/`.bak2`/`.bak3` rolling backup to the filesystem
/// scope, so later `plugin-fs` calls against it are not rejected as
/// out-of-scope.
///
/// The dialog plugin grants access to exactly the file the user picked, so
/// the backups `VaultAccessService` writes next to a vault stay forbidden
/// until they are allowed explicitly. `anchor` must already be in scope --
/// proof that it came from a dialog pick or a `persisted-scope` restore
/// rather than a path the renderer made up -- and `suffix` must be one of
/// the fixed backup suffixes, so this command can't be used to widen scope
/// to an arbitrary path anywhere on disk. `persisted-scope` keeps the grant
/// across restarts.
#[tauri::command]
fn grant_file_access(app: tauri::AppHandle, anchor: String, suffix: String) -> Result<(), String> {
    if !app.fs_scope().is_allowed(std::path::Path::new(&anchor)) {
        return Err("anchor path is not in the allowed scope".into());
    }
    let derived = derive_backup_path(&anchor, &suffix)?;
    app.fs_scope()
        .allow_file(derived)
        .map_err(|error| error.to_string())
}

/// Writes a vault file crash-safely; see `atomic_write::write_file_atomic`.
///
/// Sent as a raw request body (the bytes) plus a `path` header
/// (percent-encoded, since header values must be ASCII) rather than as JSON, so
/// a large vault isn't inflated into a JSON number array on the way over.
///
/// The path must already be in the filesystem scope -- picked by the user in a
/// dialog, or remembered by `persisted-scope` -- so this command can't be used to
/// write anywhere `plugin-fs` itself would have refused.
#[tauri::command]
fn write_file_atomic(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file contents as a raw request body".into());
    };
    let encoded_path = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .ok_or("missing `path` header")?;
    let path = percent_encoding::percent_decode_str(encoded_path)
        .decode_utf8()
        .map_err(|error| error.to_string())?;
    let path = std::path::Path::new(path.as_ref());

    if !app.fs_scope().is_allowed(path) {
        return Err(format!(
            "path is not in the allowed scope: {}",
            path.display()
        ));
    }
    atomic_write::write_file_atomic(path, bytes).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: plugins run in registration order, and a
        // second launch needs to be caught before anything else initializes.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Auto-type's hotkey has to reach Argus while another app is focused,
        // which is the whole point of a *global* shortcut. Which accelerator
        // (if any) is bound is decided in TypeScript from settings.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Must come after fs: persists filesystem paths the user grants via
        // the dialog plugin (e.g. picking a vault location) across app
        // restarts. Without this, re-opening a remembered vault path on a
        // fresh launch is rejected by Tauri's fs scope before the master
        // password is ever checked.
        .plugin(tauri_plugin_persisted_scope::init())
        .manage(auto_type::AutoTypeState::default())
        .invoke_handler(tauri::generate_handler![
            grant_file_access,
            write_file_atomic,
            auto_type::auto_type_capture_target,
            auto_type::auto_type_inspect_target,
            auto_type::auto_type_send
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::derive_backup_path;

    #[test]
    fn appends_an_allowed_backup_suffix_to_the_anchor() {
        let result = derive_backup_path("C:/vaults/mine.kdbx", ".bak1");

        assert_eq!(result, Ok("C:/vaults/mine.kdbx.bak1".to_string()));
    }

    #[test]
    fn allows_all_three_rolling_backup_suffixes() {
        assert!(derive_backup_path("C:/vaults/mine.kdbx", ".bak2").is_ok());
        assert!(derive_backup_path("C:/vaults/mine.kdbx", ".bak3").is_ok());
    }

    #[test]
    fn rejects_a_suffix_outside_the_fixed_allow_list() {
        let result = derive_backup_path("C:/vaults/mine.kdbx", ".exe");

        assert!(result.is_err());
    }

    #[test]
    fn rejects_an_empty_suffix() {
        let result = derive_backup_path("C:/vaults/mine.kdbx", "");

        assert!(result.is_err());
    }
}
