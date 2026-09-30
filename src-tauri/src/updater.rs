//! Checks for, and installs, new versions of Argus.
//!
//! The release feed is `latest.json` on the newest published GitHub Release
//! (see `plugins.updater` in `tauri.conf.json`), which the release workflow
//! only builds from commits on `main`. Every installer it points to must carry
//! a signature made with the private key matching the public key in that
//! config, so a tampered download is refused before anything runs.
//!
//! The webview gets these two commands rather than the updater plugin's own:
//! on Windows installing ends the process with `std::process::exit`, which
//! skips `RunEvent::Exit` and with it the clipboard wipe, so the wipe has to
//! run here first.

use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::clipboard;

/// The update the last check found, kept for `install_update`.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

/// What the webview is told about an available update.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    version: String,
    current_version: String,
    notes: Option<String>,
}

/// How far the download has got, in bytes. `total` is unknown when the
/// server sends no `Content-Length`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// Asks the release feed whether a newer version exists. Resolves to `None`
/// when Argus is up to date.
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<AvailableUpdate>, String> {
    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;
    let available = update.as_ref().map(|update| AvailableUpdate {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone().filter(|notes| !notes.trim().is_empty()),
    });
    *pending.0.lock().map_err(|error| error.to_string())? = update;
    Ok(available)
}

/// Downloads the update the last check found, verifies its signature, wipes
/// any secret Argus left on the clipboard, and runs the installer. On Windows
/// the installer closes Argus and starts the new version once it's done, so
/// this only returns if something went wrong.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    on_progress: Channel<DownloadProgress>,
) -> Result<(), String> {
    // Cloned rather than taken, so a failed download can be retried.
    let update = pending
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or("there is no update to install")?;

    let mut downloaded: u64 = 0;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                // Progress is only for show; a closed channel mustn't stop the download.
                let _ = on_progress.send(DownloadProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|error| error.to_string())?;

    clipboard::clear_any_secret(&app);
    update.install(bytes).map_err(|error| error.to_string())?;
    // Only reached where installing doesn't end the process itself.
    app.restart();
}
