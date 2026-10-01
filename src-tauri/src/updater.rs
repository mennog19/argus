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

/// A release's notes, or `None` when it has none worth showing: the feed
/// carries an empty or whitespace-only body for a release published without
/// any.
fn release_notes(body: Option<String>) -> Option<String> {
    body.filter(|notes| !notes.trim().is_empty())
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
        notes: release_notes(update.body.clone()),
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_release_notes_that_say_something() {
        let notes = Some("Fixes auto-type in Firefox.".to_string());

        assert_eq!(release_notes(notes.clone()), notes);
    }

    #[test]
    fn drops_missing_empty_and_blank_release_notes() {
        assert_eq!(release_notes(None), None);
        assert_eq!(release_notes(Some(String::new())), None);
        assert_eq!(release_notes(Some("  \r\n\t ".to_string())), None);
    }

    // The webview reads these by name; see `tauri-updater.ts`.
    #[test]
    fn tells_the_webview_about_an_update_in_camel_case() {
        let update = AvailableUpdate {
            version: "0.2.0".into(),
            current_version: "0.1.1".into(),
            notes: None,
        };

        assert_eq!(
            serde_json::to_value(update).unwrap(),
            json!({ "version": "0.2.0", "currentVersion": "0.1.1", "notes": null })
        );
    }

    #[test]
    fn reports_download_progress_with_an_unknown_total_as_null() {
        let known = DownloadProgress {
            downloaded: 512,
            total: Some(2048),
        };
        let unknown = DownloadProgress {
            downloaded: 512,
            total: None,
        };

        assert_eq!(
            serde_json::to_value(known).unwrap(),
            json!({ "downloaded": 512, "total": 2048 })
        );
        assert_eq!(
            serde_json::to_value(unknown).unwrap(),
            json!({ "downloaded": 512, "total": null })
        );
    }

    #[test]
    fn starts_out_with_no_update_to_install() {
        let pending = PendingUpdate::default();

        assert!(pending.0.lock().unwrap().is_none());
    }
}
