use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// Adds `path` to the filesystem scope, so later `plugin-fs` calls against it
/// are not rejected as out-of-scope.
///
/// The dialog plugin grants access to exactly the file the user picked, so
/// paths the app derives from it -- the `.bak1`/`.bak2`/`.bak3` rolling backups
/// written next to a vault -- stay forbidden until they are allowed explicitly.
/// Which paths those are is decided in TypeScript (`VaultAccessService`); this
/// command only applies the grant, which `persisted-scope` then keeps across
/// restarts.
#[tauri::command]
fn grant_file_access(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_file(path)
        .map_err(|error| error.to_string())
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
        // Must come after fs: persists filesystem paths the user grants via
        // the dialog plugin (e.g. picking a vault location) across app
        // restarts. Without this, re-opening a remembered vault path on a
        // fresh launch is rejected by Tauri's fs scope before the master
        // password is ever checked.
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![grant_file_access])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
