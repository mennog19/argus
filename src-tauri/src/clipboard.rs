//! Putting secrets on the clipboard, and taking them off again.
//!
//! The frontend decides *when* a copied secret should go (the auto-clear
//! countdown, closing the vault). This module decides whether it still can:
//! a wipe only happens while the clipboard holds exactly what Argus put there.
//! Anything the user copied since belongs to them and is left alone.
//!
//! Each write hands the frontend back a copy id, and a wipe names the copy it
//! is meant for. On Windows that id is the clipboard sequence number, which
//! the OS bumps on every change -- so "unchanged since that copy" is a plain
//! equality check, with no copy of the secret kept around to compare against.
//!
//! On Windows the copy is also marked so it stays out of clipboard history
//! (Win+V) and cloud clipboard sync, and carries a private marker format so a
//! secret left behind by a crash can be recognised and wiped on the next
//! launch.

/// Copies `text` to the clipboard as a secret. Returns the copy id to pass to
/// `clipboard_clear_secret`.
#[tauri::command]
pub fn clipboard_write_secret(app: tauri::AppHandle, text: String) -> Result<u32, String> {
    platform::write_secret(&app, &text)
}

/// Empties the clipboard, but only if it has not changed since copy `copy`.
#[tauri::command]
pub fn clipboard_clear_secret(app: tauri::AppHandle, copy: u32) -> Result<(), String> {
    platform::clear_if_unchanged(&app, copy)
}

/// Wipes a secret Argus put on the clipboard, whichever copy it came from.
/// For quitting, and for a launch after a run that never got to quit.
pub fn clear_any_secret(app: &tauri::AppHandle) {
    platform::clear_any_secret(app);
}

/// Wipes a secret on the clipboard when the process panics. Release builds
/// abort on panic, so there is no unwinding to run `RunEvent::Exit` on.
pub fn clear_on_panic() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        platform::clear_any_secret_without_app();
        previous(info);
    }));
}

#[cfg(windows)]
mod platform {
    use std::thread::sleep;
    use std::time::Duration;
    use tauri::Manager;
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardSequenceNumber, IsClipboardFormatAvailable,
        OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    /// `CF_UNICODETEXT`. Spelled out rather than pulling in the whole
    /// `Win32_System_Ole` feature for one constant.
    const CF_UNICODETEXT: u32 = 13;

    /// Registered formats that keep a copy out of clipboard history and
    /// cloud clipboard. Their presence is what counts; the first is honoured
    /// by clipboard managers too. The value `0` tells the other two "no".
    /// https://learn.microsoft.com/windows/win32/dataxchg/clipboard-formats#cloud-clipboard-and-clipboard-history-formats
    const EXCLUSION_FORMATS: [PCWSTR; 3] = [
        w!("ExcludeClipboardContentFromMonitorProcessing"),
        w!("CanIncludeInClipboardHistory"),
        w!("CanUploadToCloudClipboard"),
    ];

    /// Argus's own marker, present on the clipboard exactly while it holds a
    /// secret Argus put there.
    const SECRET_MARKER: PCWSTR = w!("Argus.Secret");

    /// Another process can hold the clipboard open for a moment (a clipboard
    /// manager reading the last change, say). Try again this many times, this
    /// far apart, before giving up.
    const OPEN_ATTEMPTS: u32 = 10;
    const OPEN_RETRY: Duration = Duration::from_millis(10);

    /// The clipboard, held open. Closed again on drop.
    struct OpenClipboardGuard;

    impl OpenClipboardGuard {
        /// Opens the clipboard for `owner`. Setting data needs an owner
        /// window; emptying it does not.
        fn open(owner: Option<HWND>) -> Result<Self, String> {
            for attempt in 0..OPEN_ATTEMPTS {
                // SAFETY: `owner` is either `None` or our own live main window.
                if unsafe { OpenClipboard(owner) }.is_ok() {
                    return Ok(Self);
                }
                if attempt + 1 < OPEN_ATTEMPTS {
                    sleep(OPEN_RETRY);
                }
            }
            Err("The clipboard is in use by another application".into())
        }
    }

    impl Drop for OpenClipboardGuard {
        fn drop(&mut self) {
            // SAFETY: pairs with the successful `OpenClipboard` in `open`.
            let _ = unsafe { CloseClipboard() };
        }
    }

    fn register(name: PCWSTR) -> u32 {
        // SAFETY: `name` is a static, NUL-terminated wide string.
        unsafe { RegisterClipboardFormatW(name) }
    }

    fn main_window(app: &tauri::AppHandle) -> Result<HWND, String> {
        let window = app
            .get_webview_window("main")
            .ok_or("The main window is gone")?;
        window.hwnd().map_err(|error| error.to_string())
    }

    /// Copies `bytes` into a movable global block and hands it to the
    /// clipboard, which owns the block from then on.
    ///
    /// # Safety
    /// The clipboard must be open, and emptied by this process.
    unsafe fn set_data(format: u32, bytes: &[u8]) -> Result<(), String> {
        let failed =
            |error: windows::core::Error| format!("Could not copy to the clipboard: {error}");

        let block: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, bytes.len()).map_err(failed)?;
        let target = GlobalLock(block) as *mut u8;
        if target.is_null() {
            let _ = GlobalFree(Some(block));
            return Err("Could not copy to the clipboard: out of memory".into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), target, bytes.len());
        // Reports an "error" when the lock count reaches zero, which is the
        // expected outcome here.
        let _ = GlobalUnlock(block);

        if let Err(error) = SetClipboardData(format, Some(HANDLE(block.0))) {
            let _ = GlobalFree(Some(block));
            return Err(failed(error));
        }
        Ok(())
    }

    pub fn write_secret(app: &tauri::AppHandle, text: &str) -> Result<u32, String> {
        let owner = main_window(app)?;
        let mut utf16: Vec<u8> = text
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_ne_bytes)
            .collect();
        let no = 0u32.to_ne_bytes();

        let written = {
            let _clipboard = OpenClipboardGuard::open(Some(owner))?;
            // SAFETY: the clipboard is open for our own window, and emptied
            // here before any data is set.
            unsafe {
                EmptyClipboard()
                    .map_err(|error| format!("Could not copy to the clipboard: {error}"))
                    .and_then(|()| {
                        for format in EXCLUSION_FORMATS {
                            set_data(register(format), &no)?;
                        }
                        set_data(register(SECRET_MARKER), &no)?;
                        set_data(CF_UNICODETEXT, &utf16)
                    })
            }
        };
        utf16.fill(0);
        written?;

        // Read after closing: the clipboard's change is only published then.
        // SAFETY: a plain query with no arguments.
        Ok(unsafe { GetClipboardSequenceNumber() })
    }

    pub fn clear_if_unchanged(_app: &tauri::AppHandle, copy: u32) -> Result<(), String> {
        let _clipboard = OpenClipboardGuard::open(None)?;
        // Checked while the clipboard is held open, so nobody can slip a copy
        // in between the check and the wipe.
        // SAFETY: plain clipboard calls while this process has it open.
        unsafe {
            if GetClipboardSequenceNumber() != copy {
                return Ok(());
            }
            EmptyClipboard().map_err(|error| format!("Could not clear the clipboard: {error}"))
        }
    }

    pub fn clear_any_secret(_app: &tauri::AppHandle) {
        clear_any_secret_without_app();
    }

    pub fn clear_any_secret_without_app() {
        let marker = register(SECRET_MARKER);
        let Ok(_clipboard) = OpenClipboardGuard::open(None) else {
            return;
        };
        // SAFETY: plain clipboard calls while this process has it open.
        unsafe {
            if IsClipboardFormatAvailable(marker).is_ok() {
                let _ = EmptyClipboard();
            }
        }
    }
}

/// Elsewhere there are no history-exclusion formats to set, and no marker
/// format through the clipboard plugin, so the last copy is remembered here
/// and compared as text.
#[cfg(not(windows))]
mod platform {
    use std::sync::Mutex;
    use tauri_plugin_clipboard_manager::ClipboardExt;

    /// The most recent copy: its id and what was copied.
    static LAST_COPY: Mutex<Option<(u32, String)>> = Mutex::new(None);

    pub fn write_secret(app: &tauri::AppHandle, text: &str) -> Result<u32, String> {
        app.clipboard()
            .write_text(text)
            .map_err(|error| error.to_string())?;
        let mut last = LAST_COPY.lock().map_err(|error| error.to_string())?;
        let id = last.as_ref().map_or(1, |(id, _)| id.wrapping_add(1));
        *last = Some((id, text.to_owned()));
        Ok(id)
    }

    fn clear_matching(app: &tauri::AppHandle, copy: Option<u32>) -> Result<(), String> {
        let mut last = LAST_COPY.lock().map_err(|error| error.to_string())?;
        let Some((id, text)) = last.as_ref() else {
            return Ok(());
        };
        if copy.is_some_and(|copy| copy != *id) {
            return Ok(());
        }
        if app.clipboard().read_text().ok().as_deref() == Some(text.as_str()) {
            app.clipboard().clear().map_err(|error| error.to_string())?;
        }
        *last = None;
        Ok(())
    }

    pub fn clear_if_unchanged(app: &tauri::AppHandle, copy: u32) -> Result<(), String> {
        clear_matching(app, Some(copy))
    }

    pub fn clear_any_secret(app: &tauri::AppHandle) {
        let _ = clear_matching(app, None);
    }

    /// Without the plugin there is no clipboard to reach from a panic hook.
    pub fn clear_any_secret_without_app() {}
}
