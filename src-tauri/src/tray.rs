//! "Minimize to tray": when the setting is on, closing the main window hides
//! it and leaves a tray icon to bring it back or quit from. When it's off,
//! there is no tray icon and closing quits, as it always did.
//!
//! Whether it's on is decided in TypeScript from settings and pushed here
//! through `set_close_to_tray`; this side only owns the icon and the close.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, Window};

/// The event emitted to the frontend when closing hid the window, so a
/// "lock when minimized" setting can treat it as a minimize.
pub const HIDDEN_TO_TRAY_EVENT: &str = "hidden-to-tray";

/// The window that minimize-to-tray applies to.
const MAIN_WINDOW: &str = "main";
const TRAY_ID: &str = "main";
const SHOW_ITEM_ID: &str = "show";
const QUIT_ITEM_ID: &str = "quit";

/// Whether a close request hides to the tray instead of quitting.
#[derive(Default)]
pub struct CloseToTray(AtomicBool);

impl CloseToTray {
    fn set(&self, enabled: bool) {
        self.0.store(enabled, Ordering::SeqCst);
    }

    /// Whether closing the window labelled `label` hides it instead of
    /// closing it. Only ever the main window: any other has no tray icon to
    /// come back from.
    fn hides(&self, label: &str) -> bool {
        label == MAIN_WINDOW && self.0.load(Ordering::SeqCst)
    }
}

/// Turns minimize-to-tray on or off, adding or removing the tray icon to match.
#[tauri::command]
pub fn set_close_to_tray(
    app: AppHandle,
    state: State<'_, CloseToTray>,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        if app.tray_by_id(TRAY_ID).is_none() {
            build_tray(&app).map_err(|error| error.to_string())?;
        }
    } else {
        app.remove_tray_by_id(TRAY_ID);
    }
    // Only once the icon exists: hiding the window with no icon to bring it
    // back from would leave Argus running with no way back in but a relaunch.
    state.set(enabled);
    Ok(())
}

/// Hides `window` to the tray if the setting is on. Returns whether it did,
/// in which case the close must be prevented.
pub fn hide_on_close<R: Runtime>(window: &Window<R>) -> bool {
    if !window.state::<CloseToTray>().hides(window.label()) {
        return false;
    }
    let _ = window.hide();
    let _ = window.app_handle().emit(HIDDEN_TO_TRAY_EVENT, ());
    true
}

/// Brings the main window back from the tray, the taskbar, or behind others.
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, SHOW_ITEM_ID, "Show Argus", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT_ITEM_ID, "Quit Argus", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Argus")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            SHOW_ITEM_ID => show_main_window(app),
            // Exits without a close request, so this really quits even
            // though closing the window no longer does.
            QUIT_ITEM_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closing_quits_until_the_setting_is_turned_on() {
        let setting = CloseToTray::default();

        assert!(!setting.hides(MAIN_WINDOW));
    }

    #[test]
    fn closing_the_main_window_hides_it_while_the_setting_is_on() {
        let setting = CloseToTray::default();
        setting.set(true);

        assert!(setting.hides(MAIN_WINDOW));
    }

    #[test]
    fn closing_quits_again_once_the_setting_is_turned_back_off() {
        let setting = CloseToTray::default();
        setting.set(true);
        setting.set(false);

        assert!(!setting.hides(MAIN_WINDOW));
    }

    #[test]
    fn only_the_main_window_hides_to_the_tray() {
        let setting = CloseToTray::default();
        setting.set(true);

        assert!(!setting.hides("settings"));
        assert!(!setting.hides(""));
    }
}
