//! Tells the frontend when the Windows session is locked (Win+L, Ctrl+Alt+Del
//! then Lock, or a lock screen timeout), so it can lock the vault the way
//! KeePass and KeePassXC do. Whether a lock actually follows is decided in
//! TypeScript from settings; this only reports the OS event.
//!
//! The webview has no way to see a session lock itself, so the main window
//! registers for WTS session notifications and its window procedure is
//! subclassed to catch them.

/// The event emitted to the frontend when the session locks.
pub const SESSION_LOCKED_EVENT: &str = "session-locked";

/// Starts watching for session locks on the main window.
pub fn watch(app: &tauri::AppHandle) {
    platform::watch(app);
}

#[cfg(windows)]
mod platform {
    use std::sync::OnceLock;
    use tauri::{Emitter, Manager};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::RemoteDesktop::{
        WTSRegisterSessionNotification, WTSUnRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION,
    };
    use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::WM_NCDESTROY;

    /// Spelled out rather than hunting down which feature exports them.
    const WM_WTSSESSION_CHANGE: u32 = 0x02B1;
    const WTS_SESSION_LOCK: usize = 0x7;

    /// Identifies our subclass among any others on the window.
    const SUBCLASS_ID: usize = 0x4152_4755; // "ARGU"

    /// The window procedure is a plain function pointer, so the app handle it
    /// emits through lives here.
    static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

    pub fn watch(app: &tauri::AppHandle) {
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let Ok(hwnd) = window.hwnd() else {
            return;
        };
        let _ = APP.set(app.clone());
        // SAFETY: `hwnd` is our own live main window, and `session_proc`
        // matches the subclass procedure signature. Both are undone in
        // `session_proc` when the window is destroyed.
        unsafe {
            if !SetWindowSubclass(hwnd, Some(session_proc), SUBCLASS_ID, 0).as_bool() {
                return;
            }
            if WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION).is_err() {
                let _ = RemoveWindowSubclass(hwnd, Some(session_proc), SUBCLASS_ID);
            }
        }
    }

    unsafe extern "system" fn session_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _subclass_id: usize,
        _ref_data: usize,
    ) -> LRESULT {
        match message {
            WM_WTSSESSION_CHANGE if wparam.0 == WTS_SESSION_LOCK => {
                if let Some(app) = APP.get() {
                    let _ = app.emit(super::SESSION_LOCKED_EVENT, ());
                }
            }
            WM_NCDESTROY => {
                let _ = WTSUnRegisterSessionNotification(hwnd);
                let _ = RemoveWindowSubclass(hwnd, Some(session_proc), SUBCLASS_ID);
            }
            _ => {}
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }
}

/// Nothing to watch outside Windows yet; the setting simply never fires.
#[cfg(not(windows))]
mod platform {
    pub fn watch(_app: &tauri::AppHandle) {}
}
