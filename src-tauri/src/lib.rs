use tauri::Manager;

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
        // Must come after fs: persists filesystem paths the user grants via
        // the dialog plugin (e.g. picking a vault location) across app
        // restarts. Without this, re-opening a remembered vault path on a
        // fresh launch is rejected by Tauri's fs scope before the master
        // password is ever checked.
        .plugin(tauri_plugin_persisted_scope::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
