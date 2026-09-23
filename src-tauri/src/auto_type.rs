//! Auto-type: typing an entry's credentials into another application.
//!
//! All the decisions -- which entry matches the focused window, what sequence
//! to play, where the password comes from -- are made in TypeScript. This
//! module is the OS shell for them: it remembers which window was in front
//! when the hotkey fired, and later refocuses that window and replays a flat
//! list of already-resolved steps into it.
//!
//! The target window is kept here rather than handed back to the frontend on
//! purpose. A raw `HWND` in JavaScript would be meaningless to it and would
//! turn `auto_type_send` into "type this password into any window I name".

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

/// A non-character key a sequence can press.
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AutoTypeKey {
    Tab,
    Enter,
    Space,
    Backspace,
    Delete,
    Escape,
    Home,
    End,
    Up,
    Down,
    Left,
    Right,
}

/// One resolved instruction. Mirrors `AutoTypeStep` in `src/domain/auto-type.ts`.
#[derive(Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AutoTypeStep {
    Text { text: String },
    Key { key: AutoTypeKey },
    Delay { milliseconds: u64 },
}

/// What the frontend is told about the window it is about to type into.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundWindow {
    pub title: String,
    pub process_name: String,
}

/// The window captured by the most recent hotkey press, if any.
#[derive(Default)]
pub struct AutoTypeState {
    target: Mutex<Option<isize>>,
}

/// A foreground window as the platform layer found it.
pub struct CapturedWindow {
    pub handle: isize,
    pub title: String,
    pub process_name: String,
}

/// Records the foreground window as the auto-type target, then brings Argus
/// to the front so the user can pick an entry.
///
/// The two halves belong in one command: the snapshot has to be taken before
/// anything steals the foreground, and raising our own window is only
/// permitted in the moment right after the hotkey fired -- Windows grants
/// `SetForegroundWindow` to the process whose hotkey it just delivered.
/// Splitting this across a second round trip to the frontend would race both.
///
/// Returns `None` when there is nothing to type into: no foreground window,
/// or Argus itself is in front -- pressing the hotkey while looking at the
/// vault should do nothing rather than type into the vault, and nothing is
/// raised in that case either.
#[tauri::command]
pub fn auto_type_capture_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, AutoTypeState>,
) -> Option<ForegroundWindow> {
    let captured = platform::foreground_window()?;
    *state.target.lock().expect("auto-type target mutex") = Some(captured.handle);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    Some(ForegroundWindow {
        title: captured.title,
        process_name: captured.process_name,
    })
}

/// Refocuses the captured window and plays `steps` into it.
///
/// Runs on a blocking thread: a sequence with `{DELAY}` in it sleeps, and
/// driving synthetic input is not something to do on the UI thread.
#[tauri::command]
pub async fn auto_type_send(
    state: tauri::State<'_, AutoTypeState>,
    steps: Vec<AutoTypeStep>,
) -> Result<(), String> {
    let handle = (*state.target.lock().expect("auto-type target mutex"))
        .ok_or("No window was captured for auto-type")?;

    tauri::async_runtime::spawn_blocking(move || platform::type_into(handle, &steps))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(windows)]
mod platform {
    use super::{AutoTypeKey, AutoTypeStep, CapturedWindow};
    use std::thread::sleep;
    use std::time::Duration;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, MAX_PATH};
    use windows::Win32::System::Threading::{
        AttachThreadInput, GetCurrentProcessId, GetCurrentThreadId, OpenProcess,
        QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_BACK, VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_HOME,
        VK_LEFT, VK_RETURN, VK_RIGHT, VK_SPACE, VK_TAB, VK_UP,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
        IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    /// How long to let the target window settle after refocusing it before
    /// typing. Without this the first characters land while the window is
    /// still taking focus, and are dropped.
    const FOCUS_SETTLE: Duration = Duration::from_millis(120);

    /// Pause between steps. Some login forms run per-keystroke JavaScript
    /// that misses input arriving with no gap at all.
    const STEP_PAUSE: Duration = Duration::from_millis(12);

    pub fn foreground_window() -> Option<CapturedWindow> {
        // SAFETY: plain Win32 queries against a handle the OS just returned;
        // none of them retain anything or transfer ownership.
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }

            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == GetCurrentProcessId() {
                return None;
            }

            Some(CapturedWindow {
                handle: hwnd.0 as isize,
                title: window_title(hwnd),
                process_name: process_name(pid).unwrap_or_default(),
            })
        }
    }

    pub fn type_into(handle: isize, steps: &[AutoTypeStep]) -> Result<(), String> {
        let hwnd = HWND(handle as *mut std::ffi::c_void);

        // SAFETY: `hwnd` came from `GetForegroundWindow` in this process. A
        // window closed since then simply fails these calls, which is why the
        // focus result is checked before any input is sent.
        if !unsafe { focus(hwnd) } {
            return Err("Could not bring the target window back to the front".into());
        }
        sleep(FOCUS_SETTLE);

        for step in steps {
            match step {
                AutoTypeStep::Delay { milliseconds } => sleep(Duration::from_millis(*milliseconds)),
                AutoTypeStep::Text { text } => send(&unicode_inputs(text))?,
                AutoTypeStep::Key { key } => send(&key_inputs(virtual_key(*key)))?,
            }
            sleep(STEP_PAUSE);
        }
        Ok(())
    }

    /// Brings `hwnd` to the front, borrowing the target thread's input state
    /// first. Windows only lets the foreground process reassign the
    /// foreground, and Argus has just taken it itself to show the picker --
    /// attaching to the target's input queue is what makes the handover work.
    unsafe fn focus(hwnd: HWND) -> bool {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }

        let target_thread = GetWindowThreadProcessId(hwnd, None);
        let this_thread = GetCurrentThreadId();
        let attached = target_thread != this_thread
            && AttachThreadInput(this_thread, target_thread, true).as_bool();

        let focused = SetForegroundWindow(hwnd).as_bool();

        if attached {
            let _ = AttachThreadInput(this_thread, target_thread, false);
        }
        focused
    }

    unsafe fn window_title(hwnd: HWND) -> String {
        let length = GetWindowTextLengthW(hwnd);
        if length <= 0 {
            return String::new();
        }
        // +1 for the terminator `GetWindowTextW` always writes.
        let mut buffer = vec![0u16; length as usize + 1];
        let written = GetWindowTextW(hwnd, &mut buffer);
        String::from_utf16_lossy(&buffer[..written as usize])
    }

    unsafe fn process_name(pid: u32) -> Option<String> {
        let handle: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = [0u16; MAX_PATH as usize];
        let mut length = buffer.len() as u32;
        let queried = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        );
        let _ = CloseHandle(handle);
        queried.ok()?;

        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        Some(path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string())
    }

    fn send(inputs: &[INPUT]) -> Result<(), String> {
        // SAFETY: `inputs` is a live slice of initialized `INPUT` structs, and
        // the size argument describes that same struct.
        let sent = unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize == inputs.len() {
            Ok(())
        } else {
            Err("The system blocked synthetic keyboard input".into())
        }
    }

    fn keyboard_input(vk: VIRTUAL_KEY, scan: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: scan,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    /// Down+up for a virtual key.
    fn key_inputs(vk: VIRTUAL_KEY) -> Vec<INPUT> {
        vec![
            keyboard_input(vk, 0, KEYBD_EVENT_FLAGS(0)),
            keyboard_input(vk, 0, KEYEVENTF_KEYUP),
        ]
    }

    /// Down+up per UTF-16 code unit, sent as one batch so a surrogate pair
    /// reaches the target as a single character rather than two broken
    /// halves. `KEYEVENTF_UNICODE` bypasses the keyboard layout entirely, so
    /// a generated password types identically on any layout.
    fn unicode_inputs(text: &str) -> Vec<INPUT> {
        text.encode_utf16()
            .flat_map(|unit| {
                [
                    keyboard_input(VIRTUAL_KEY(0), unit, KEYEVENTF_UNICODE),
                    keyboard_input(VIRTUAL_KEY(0), unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP),
                ]
            })
            .collect()
    }

    fn virtual_key(key: AutoTypeKey) -> VIRTUAL_KEY {
        match key {
            AutoTypeKey::Tab => VK_TAB,
            AutoTypeKey::Enter => VK_RETURN,
            AutoTypeKey::Space => VK_SPACE,
            AutoTypeKey::Backspace => VK_BACK,
            AutoTypeKey::Delete => VK_DELETE,
            AutoTypeKey::Escape => VK_ESCAPE,
            AutoTypeKey::Home => VK_HOME,
            AutoTypeKey::End => VK_END,
            AutoTypeKey::Up => VK_UP,
            AutoTypeKey::Down => VK_DOWN,
            AutoTypeKey::Left => VK_LEFT,
            AutoTypeKey::Right => VK_RIGHT,
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{AutoTypeStep, CapturedWindow};

    pub fn foreground_window() -> Option<CapturedWindow> {
        None
    }

    pub fn type_into(_handle: isize, _steps: &[AutoTypeStep]) -> Result<(), String> {
        Err("Auto-type is only implemented on Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{AutoTypeKey, AutoTypeStep};

    #[test]
    fn deserializes_the_step_shape_the_frontend_sends() {
        let json = r#"[
            {"kind":"text","text":"menno"},
            {"kind":"key","key":"tab"},
            {"kind":"delay","milliseconds":250}
        ]"#;

        let steps: Vec<AutoTypeStep> = serde_json::from_str(json).expect("steps should parse");

        assert_eq!(
            steps,
            vec![
                AutoTypeStep::Text {
                    text: "menno".into()
                },
                AutoTypeStep::Key {
                    key: AutoTypeKey::Tab
                },
                AutoTypeStep::Delay { milliseconds: 250 },
            ]
        );
    }

    #[test]
    fn rejects_a_key_the_frontend_never_sends() {
        let result: Result<AutoTypeStep, _> = serde_json::from_str(r#"{"kind":"key","key":"f13"}"#);

        assert!(result.is_err());
    }
}
