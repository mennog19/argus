//! Auto-type: typing an entry's credentials into another application.
//!
//! All the decisions -- which entry matches the focused window, which fields
//! to fill, where the password comes from -- are made in TypeScript. This
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

/// A login field a `Focus` step can move focus to.
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FormField {
    Username,
    Password,
}

/// One resolved instruction. Mirrors `AutoTypeStep` in `src/domain/auto-type.ts`.
#[derive(Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AutoTypeStep {
    /// Puts the caret in the field, selecting whatever is already there.
    Focus {
        field: FormField,
    },
    Text {
        text: String,
    },
    /// Presses Enter.
    Submit,
}

/// Which login fields the target window has. Mirrors `FormLayout` in
/// `src/domain/auto-type.ts`.
#[derive(Serialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FormLayout {
    pub has_username_field: bool,
    pub has_password_field: bool,
}

/// What UI Automation reported about one text box, reduced to what choosing
/// the login fields needs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FieldInfo {
    pub is_password: bool,
    /// The box says it's for searching, so it's never somewhere a username belongs.
    pub is_search: bool,
}

/// Which of a window's text boxes (in document order) are the login fields.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct FieldPicks {
    pub username: Option<usize>,
    pub password: Option<usize>,
}

fn can_hold_username(field: &FieldInfo) -> bool {
    !field.is_password && !field.is_search
}

/// Picks the login fields out of `fields`, which must be in document order.
///
/// The password field is the first one flagged as a password. The username is
/// the nearest text box before it -- the one a person reads as "the box above
/// the password". With no password field on screen (the first page of a
/// two-step login) a username is only picked when it's unambiguous: exactly one
/// candidate, because typing a username into the wrong box of a busy page and
/// pressing Enter is worse than typing nothing.
pub fn pick_fields(fields: &[FieldInfo]) -> FieldPicks {
    let password = fields.iter().position(|field| field.is_password);

    let username = match password {
        Some(password) => fields[..password].iter().rposition(can_hold_username),
        None => {
            let mut candidates = fields
                .iter()
                .enumerate()
                .filter(|(_, field)| can_hold_username(field));
            match (candidates.next(), candidates.next()) {
                (Some((index, _)), None) => Some(index),
                _ => None,
            }
        }
    };

    FieldPicks { username, password }
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

fn captured_target(state: &AutoTypeState) -> Result<isize, String> {
    (*state.target.lock().expect("auto-type target mutex"))
        .ok_or_else(|| "No window was captured for auto-type".to_string())
}

/// Reports which login fields the captured window has, using UI Automation --
/// the same accessibility tree screen readers walk. Lets the frontend aim at
/// fields instead of guessing a tab order.
///
/// Runs on a blocking thread: the first look at a browser can take a moment
/// while it builds its accessibility tree.
#[tauri::command]
pub async fn auto_type_inspect_target(
    state: tauri::State<'_, AutoTypeState>,
) -> Result<FormLayout, String> {
    let handle = captured_target(&state)?;

    tauri::async_runtime::spawn_blocking(move || platform::inspect(handle))
        .await
        .map_err(|error| error.to_string())?
}

/// Refocuses the captured window and plays `steps` into it.
///
/// Runs on a blocking thread: it sleeps between steps, and
/// driving synthetic input is not something to do on the UI thread.
#[tauri::command]
pub async fn auto_type_send(
    state: tauri::State<'_, AutoTypeState>,
    steps: Vec<AutoTypeStep>,
) -> Result<(), String> {
    let handle = captured_target(&state)?;

    tauri::async_runtime::spawn_blocking(move || platform::type_into(handle, &steps))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(windows)]
mod platform {
    use super::{pick_fields, AutoTypeStep, CapturedWindow, FieldInfo, FormField, FormLayout};
    use std::thread::sleep;
    use std::time::Duration;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, MAX_PATH};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Threading::{
        AttachThreadInput, GetCurrentProcessId, GetCurrentThreadId, OpenProcess,
        QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
        UIA_ControlTypePropertyId, UIA_DocumentControlTypeId, UIA_EditControlTypeId,
        UIA_IsEnabledPropertyId,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_CONTROL, VK_RETURN,
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

    /// Let a focused field finish taking focus before its content is
    /// selected and typed over.
    const FIELD_FOCUS_SETTLE: Duration = Duration::from_millis(60);

    /// A browser builds its accessibility tree lazily, the first time a client
    /// asks: the first look can see a page with no fields in it at all. While
    /// nothing has been seen, look again this many times, this far apart.
    const LOCATE_ATTEMPTS: u32 = 8;
    const LOCATE_RETRY: Duration = Duration::from_millis(150);

    /// COM has to be initialised on any thread that uses UI Automation.
    /// Declared in a struct whose COM objects are dropped *before* this guard.
    struct ComGuard {
        initialized: bool,
    }

    impl ComGuard {
        fn new() -> Self {
            // SAFETY: balanced by `CoUninitialize` in `drop`, on the same thread.
            // `S_FALSE` (already initialised) counts as success and needs the
            // same balancing call; a failure (thread already in another
            // apartment mode) means there's nothing of ours to undo.
            let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
            Self { initialized }
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.initialized {
                // SAFETY: pairs with the successful `CoInitializeEx` in `new`.
                unsafe { CoUninitialize() };
            }
        }
    }

    /// The login fields UI Automation found in a window.
    struct LocatedForm {
        username: Option<IUIAutomationElement>,
        password: Option<IUIAutomationElement>,
        /// Whether any text box at all was visible, i.e. the tree was built.
        saw_any_field: bool,
    }

    /// A UI Automation client. Field order matters: `automation` must be
    /// released before `_com` uninitialises COM.
    struct Uia {
        automation: IUIAutomation,
        _com: ComGuard,
    }

    impl Uia {
        fn new() -> Result<Self, String> {
            let com = ComGuard::new();
            // SAFETY: COM is initialised on this thread by `com` above.
            let automation: IUIAutomation =
                unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }
                    .map_err(|error| format!("UI Automation is unavailable: {error}"))?;
            Ok(Self {
                automation,
                _com: com,
            })
        }

        /// Finds the login fields, waiting out a browser that hasn't built its
        /// accessibility tree yet.
        fn locate(&self, hwnd: HWND) -> Result<LocatedForm, String> {
            let mut form = self.scan(hwnd)?;
            for _ in 1..LOCATE_ATTEMPTS {
                if form.saw_any_field {
                    break;
                }
                sleep(LOCATE_RETRY);
                form = self.scan(hwnd)?;
            }
            Ok(form)
        }

        fn scan(&self, hwnd: HWND) -> Result<LocatedForm, String> {
            let failed = |error: windows::core::Error| format!("UI Automation failed: {error}");

            // SAFETY: every call below is a UI Automation query against
            // interface pointers it just returned; none retain a raw pointer
            // beyond the call. `hwnd` may be stale, which fails the query.
            unsafe {
                let root = self.automation.ElementFromHandle(hwnd).map_err(failed)?;

                // In a browser the address bar and tabs are text boxes too. The
                // page itself is a Document, so search only inside it when
                // there is one; other apps are searched whole.
                let is_document = self
                    .automation
                    .CreatePropertyCondition(
                        UIA_ControlTypePropertyId,
                        &VARIANT::from(UIA_DocumentControlTypeId.0),
                    )
                    .map_err(failed)?;
                let scope = root
                    .FindFirst(TreeScope_Descendants, &is_document)
                    .unwrap_or(root);

                let is_edit = self
                    .automation
                    .CreatePropertyCondition(
                        UIA_ControlTypePropertyId,
                        &VARIANT::from(UIA_EditControlTypeId.0),
                    )
                    .map_err(failed)?;
                let is_enabled = self
                    .automation
                    .CreatePropertyCondition(UIA_IsEnabledPropertyId, &VARIANT::from(true))
                    .map_err(failed)?;
                let condition = self
                    .automation
                    .CreateAndCondition(&is_edit, &is_enabled)
                    .map_err(failed)?;

                let found = scope
                    .FindAll(TreeScope_Descendants, &condition)
                    .map_err(failed)?;
                let count = found.Length().map_err(failed)?;

                let mut elements = Vec::new();
                let mut infos = Vec::new();
                for index in 0..count {
                    let element = found.GetElement(index).map_err(failed)?;
                    infos.push(FieldInfo {
                        is_password: element.CurrentIsPassword().map_err(failed)?.as_bool(),
                        is_search: looks_like_search(&element),
                    });
                    elements.push(element);
                }

                let picks = pick_fields(&infos);
                Ok(LocatedForm {
                    username: picks.username.map(|index| elements[index].clone()),
                    password: picks.password.map(|index| elements[index].clone()),
                    saw_any_field: count > 0,
                })
            }
        }

        /// Puts the caret in `field` with any existing text selected, so what
        /// is typed next replaces it rather than being appended to it.
        fn focus_field(&self, hwnd: HWND, field: FormField) -> Result<(), String> {
            let form = self.locate(hwnd)?;
            let (element, name) = match field {
                FormField::Username => (form.username, "username"),
                FormField::Password => (form.password, "password"),
            };
            let element = element.ok_or_else(|| format!("Could not find the {name} field"))?;

            // SAFETY: `element` is a live UI Automation element.
            unsafe { element.SetFocus() }
                .map_err(|error| format!("Could not focus the {name} field: {error}"))?;
            sleep(FIELD_FOCUS_SETTLE);
            send(&select_all_inputs())
        }
    }

    /// Whether a text box announces itself as a search box, by name or id.
    unsafe fn looks_like_search(element: &IUIAutomationElement) -> bool {
        let mentions_search = |text: windows::core::Result<windows::core::BSTR>| {
            text.map(|text| text.to_string().to_lowercase().contains("search"))
                .unwrap_or(false)
        };
        mentions_search(element.CurrentName()) || mentions_search(element.CurrentAutomationId())
    }

    pub fn inspect(handle: isize) -> Result<FormLayout, String> {
        let hwnd = HWND(handle as *mut std::ffi::c_void);
        let form = Uia::new()?.locate(hwnd)?;
        Ok(FormLayout {
            has_username_field: form.username.is_some(),
            has_password_field: form.password.is_some(),
        })
    }

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

        // Created on the first `Focus` step, so COM is only touched when
        // there is a field to find.
        let mut uia: Option<Uia> = None;

        for step in steps {
            match step {
                AutoTypeStep::Focus { field } => {
                    if uia.is_none() {
                        uia = Some(Uia::new()?);
                    }
                    if let Some(uia) = &uia {
                        uia.focus_field(hwnd, *field)?;
                    }
                }
                AutoTypeStep::Text { text } => send(&unicode_inputs(text))?,
                AutoTypeStep::Submit => send(&enter_inputs())?,
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

    /// Enter: down, up.
    fn enter_inputs() -> Vec<INPUT> {
        vec![
            keyboard_input(VK_RETURN, 0, KEYBD_EVENT_FLAGS(0)),
            keyboard_input(VK_RETURN, 0, KEYEVENTF_KEYUP),
        ]
    }

    /// Ctrl+A: Ctrl down, A down, A up, Ctrl up.
    fn select_all_inputs() -> Vec<INPUT> {
        let a = VIRTUAL_KEY(b'A' as u16);
        vec![
            keyboard_input(VK_CONTROL, 0, KEYBD_EVENT_FLAGS(0)),
            keyboard_input(a, 0, KEYBD_EVENT_FLAGS(0)),
            keyboard_input(a, 0, KEYEVENTF_KEYUP),
            keyboard_input(VK_CONTROL, 0, KEYEVENTF_KEYUP),
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
}

#[cfg(not(windows))]
mod platform {
    use super::{AutoTypeStep, CapturedWindow, FormLayout};

    pub fn foreground_window() -> Option<CapturedWindow> {
        None
    }

    pub fn inspect(_handle: isize) -> Result<FormLayout, String> {
        Ok(FormLayout::default())
    }

    pub fn type_into(_handle: isize, _steps: &[AutoTypeStep]) -> Result<(), String> {
        Err("Auto-type is only implemented on Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{pick_fields, AutoTypeStep, FieldInfo, FieldPicks, FormField, FormLayout};

    #[test]
    fn deserializes_the_step_shape_the_frontend_sends() {
        let json = r#"[
            {"kind":"focus","field":"username"},
            {"kind":"text","text":"menno"},
            {"kind":"focus","field":"password"},
            {"kind":"submit"}
        ]"#;

        let steps: Vec<AutoTypeStep> = serde_json::from_str(json).expect("steps should parse");

        assert_eq!(
            steps,
            vec![
                AutoTypeStep::Focus {
                    field: FormField::Username
                },
                AutoTypeStep::Text {
                    text: "menno".into()
                },
                AutoTypeStep::Focus {
                    field: FormField::Password
                },
                AutoTypeStep::Submit,
            ]
        );
    }

    #[test]
    fn rejects_a_field_the_frontend_never_sends() {
        let result: Result<AutoTypeStep, _> =
            serde_json::from_str(r#"{"kind":"focus","field":"totp"}"#);

        assert!(result.is_err());
    }

    #[test]
    fn serializes_the_form_layout_the_frontend_reads() {
        let layout = FormLayout {
            has_username_field: true,
            has_password_field: false,
        };

        assert_eq!(
            serde_json::to_string(&layout).expect("layout should serialize"),
            r#"{"hasUsernameField":true,"hasPasswordField":false}"#
        );
    }

    fn text_box() -> FieldInfo {
        FieldInfo {
            is_password: false,
            is_search: false,
        }
    }

    fn password_box() -> FieldInfo {
        FieldInfo {
            is_password: true,
            ..text_box()
        }
    }

    fn search_box() -> FieldInfo {
        FieldInfo {
            is_search: true,
            ..text_box()
        }
    }

    #[test]
    fn picks_the_text_box_nearest_above_the_password() {
        // A stray text box, then the real username, a password, then a
        // trailing one (a "remember this device" name, say).
        let picks = pick_fields(&[text_box(), text_box(), password_box(), text_box()]);

        assert_eq!(
            picks,
            FieldPicks {
                username: Some(1),
                password: Some(2)
            }
        );
    }

    #[test]
    fn skips_a_search_box_between_the_username_and_password() {
        let picks = pick_fields(&[text_box(), search_box(), password_box()]);

        assert_eq!(picks.username, Some(0));
    }

    #[test]
    fn takes_the_first_password_when_there_is_a_confirmation_box() {
        let picks = pick_fields(&[text_box(), password_box(), password_box()]);

        assert_eq!(picks.password, Some(1));
    }

    #[test]
    fn finds_only_the_password_on_a_password_only_page() {
        let picks = pick_fields(&[password_box()]);

        assert_eq!(
            picks,
            FieldPicks {
                username: None,
                password: Some(0)
            }
        );
    }

    #[test]
    fn ignores_a_search_box_that_precedes_a_password_only_form() {
        let picks = pick_fields(&[search_box(), password_box()]);

        assert_eq!(picks.username, None);
    }

    #[test]
    fn picks_a_lone_text_box_as_the_username_when_there_is_no_password() {
        let picks = pick_fields(&[text_box()]);

        assert_eq!(
            picks,
            FieldPicks {
                username: Some(0),
                password: None
            }
        );
    }

    #[test]
    fn refuses_to_guess_between_several_text_boxes_without_a_password() {
        assert_eq!(
            pick_fields(&[text_box(), text_box()]),
            FieldPicks::default()
        );
    }

    #[test]
    fn a_search_box_does_not_make_a_lone_text_box_ambiguous() {
        let picks = pick_fields(&[search_box(), text_box()]);

        assert_eq!(picks.username, Some(1));
    }

    #[test]
    fn finds_nothing_in_an_empty_window() {
        assert_eq!(pick_fields(&[]), FieldPicks::default());
    }

    #[test]
    fn rejects_a_step_kind_the_frontend_never_sends() {
        let result: Result<AutoTypeStep, _> = serde_json::from_str(r#"{"kind":"key","key":"tab"}"#);

        assert!(result.is_err());
    }
}
