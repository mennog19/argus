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
    /// The window belongs to a browser whose address bar Argus knows how to read.
    pub is_browser: bool,
    /// What that address bar showed. `None` for other apps, and for a browser
    /// whose address couldn't be read.
    pub url: Option<String>,
}

/// Where a browser keeps its address bar in the UI Automation tree.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Browser {
    /// Chrome, Edge, Brave and friends: the omnibox is the first text box in
    /// the browser's own toolbar, ahead of the page.
    Chromium,
    /// Firefox and its forks: the address bar has a stable automation id.
    Firefox,
}

/// The browser family `process_name` (e.g. `chrome.exe`) belongs to, if any.
///
/// The page title is chosen by the page, so a phishing site can call itself
/// "github.com - Sign in". The address bar is drawn by the browser, and is
/// what auto-type matches on whenever it can be read.
pub fn browser_for(process_name: &str) -> Option<Browser> {
    match process_name.to_ascii_lowercase().as_str() {
        "chrome.exe" | "msedge.exe" | "brave.exe" | "vivaldi.exe" | "opera.exe"
        | "chromium.exe" | "arc.exe" => Some(Browser::Chromium),
        "firefox.exe" | "librewolf.exe" | "waterfox.exe" | "floorp.exe" | "zen.exe" => {
            Some(Browser::Firefox)
        }
        _ => None,
    }
}

/// The address in an address bar's text, or `None` when it holds nothing
/// that could be one -- empty, or search terms (Chrome shows those in place of
/// the address on a results page), which contain spaces a URL can't.
pub fn address_from(text: &str) -> Option<String> {
    let trimmed = text.trim();
    (!trimmed.is_empty() && !trimmed.contains(char::is_whitespace)).then(|| trimmed.to_string())
}

/// The window captured by the most recent hotkey press, if any.
#[derive(Default)]
pub struct AutoTypeState {
    target: Mutex<Option<Target>>,
}

/// The window to type into, and the title it had when the entry was chosen
/// for it. A browser keeps one window across tabs, so the handle alone can't
/// tell whether the page is still the one the entry was matched against.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub handle: isize,
    pub title: String,
    /// For a browser, which kind -- so its address bar can be read again.
    pub browser: Option<Browser>,
    /// The address the entry was matched against, when one was read.
    pub url: Option<String>,
}

/// Checks that the window in front is still the captured one, showing the
/// same title. Called before every keystroke batch: if the user switched
/// windows or tabs, or the page navigated, the credentials would go somewhere
/// they were never matched to.
pub fn check_target(target: &Target, foreground: isize, title: &str) -> Result<(), String> {
    if foreground != target.handle {
        return Err("The target window is no longer in front; auto-type was stopped".into());
    }
    if title != target.title {
        return Err("The target window's title changed; auto-type was stopped".into());
    }
    Ok(())
}

/// Checks that a browser still shows the address the entry was matched
/// against. A page can keep its title while navigating somewhere else, so
/// the title check alone can't catch that; this runs once, right before the
/// first keystroke. Nothing to compare when no address was read at capture.
pub fn check_address(target: &Target, current: Option<&str>) -> Result<(), String> {
    match &target.url {
        Some(expected) if current != Some(expected.as_str()) => {
            Err("The page's address changed; auto-type was stopped".into())
        }
        _ => Ok(()),
    }
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
///
/// For a browser, the address bar is read afterwards, on a blocking thread:
/// UI Automation can take a moment, and the address doesn't change just
/// because Argus came to the front.
#[tauri::command]
pub async fn auto_type_capture_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, AutoTypeState>,
) -> Result<Option<ForegroundWindow>, String> {
    let Some(captured) = platform::foreground_window() else {
        return Ok(None);
    };
    let browser = browser_for(&captured.process_name);
    let target = Target {
        handle: captured.handle,
        title: captured.title.clone(),
        browser,
        url: None,
    };
    *state.target.lock().expect("auto-type target mutex") = Some(target.clone());

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    let url = match browser {
        Some(browser) => {
            let handle = captured.handle;
            // A failed read is reported as "no address", which the frontend
            // shows as a warning -- never as a reason to abandon the capture.
            tauri::async_runtime::spawn_blocking(move || platform::browser_address(handle, browser))
                .await
                .ok()
                .flatten()
        }
        None => None,
    };
    if url.is_some() {
        let mut stored = state.target.lock().expect("auto-type target mutex");
        // Only if no later press has replaced the target in the meantime.
        if stored.as_ref() == Some(&target) {
            *stored = Some(Target {
                url: url.clone(),
                ..target
            });
        }
    }

    Ok(Some(ForegroundWindow {
        title: captured.title,
        process_name: captured.process_name,
        is_browser: browser.is_some(),
        url,
    }))
}

fn captured_target(state: &AutoTypeState) -> Result<Target, String> {
    state
        .target
        .lock()
        .expect("auto-type target mutex")
        .clone()
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
    let handle = captured_target(&state)?.handle;

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
    let target = captured_target(&state)?;

    tauri::async_runtime::spawn_blocking(move || platform::type_into(&target, &steps))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(windows)]
mod platform {
    use super::{
        address_from, check_address, check_target, pick_fields, AutoTypeStep, Browser,
        CapturedWindow, FieldInfo, FormField, FormLayout, Target,
    };
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
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationValuePattern,
        TreeScope_Descendants, UIA_AutomationIdPropertyId, UIA_ControlTypePropertyId,
        UIA_DocumentControlTypeId, UIA_EditControlTypeId, UIA_IsEnabledPropertyId,
        UIA_ValuePatternId,
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

    /// Looks for the address bar this many times before giving up on it. It
    /// is part of the browser's own UI, so it's normally there at once; the
    /// retries cover a browser that builds its tree lazily on first contact.
    const ADDRESS_ATTEMPTS: u32 = 3;

    /// How far up from a candidate address bar to look for the page's
    /// document before deciding it isn't inside the page.
    const MAX_ANCESTOR_DEPTH: u32 = 64;

    /// Firefox's address bar input, by automation id.
    const FIREFOX_URLBAR_ID: &str = "urlbar-input";

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

        /// Reads the address bar of the browser window `hwnd`.
        fn address(&self, hwnd: HWND, browser: Browser) -> Option<String> {
            let mut bar = self.find_address_bar(hwnd, browser);
            for _ in 1..ADDRESS_ATTEMPTS {
                if bar.is_some() {
                    break;
                }
                sleep(LOCATE_RETRY);
                bar = self.find_address_bar(hwnd, browser);
            }
            // SAFETY: `bar` is a live UI Automation element; the pattern and
            // value are fetched and copied out within this call.
            unsafe {
                let pattern: IUIAutomationValuePattern =
                    bar?.GetCurrentPatternAs(UIA_ValuePatternId).ok()?;
                address_from(&pattern.CurrentValue().ok()?.to_string())
            }
        }

        fn find_address_bar(&self, hwnd: HWND, browser: Browser) -> Option<IUIAutomationElement> {
            // SAFETY: UI Automation queries against interface pointers it just
            // returned; a stale `hwnd` fails the first one.
            unsafe {
                let root = self.automation.ElementFromHandle(hwnd).ok()?;
                match browser {
                    Browser::Firefox => {
                        let by_id = self
                            .automation
                            .CreatePropertyCondition(
                                UIA_AutomationIdPropertyId,
                                &VARIANT::from(FIREFOX_URLBAR_ID),
                            )
                            .ok()?;
                        root.FindFirst(TreeScope_Descendants, &by_id).ok()
                    }
                    Browser::Chromium => {
                        let is_edit = self
                            .automation
                            .CreatePropertyCondition(
                                UIA_ControlTypePropertyId,
                                &VARIANT::from(UIA_EditControlTypeId.0),
                            )
                            .ok()?;
                        // Tree order puts the toolbar ahead of the page, so the
                        // first text box is the omnibox. Checked anyway: a text
                        // box the page itself drew must never pass for the address.
                        let candidate = root.FindFirst(TreeScope_Descendants, &is_edit).ok()?;
                        let is_document = self
                            .automation
                            .CreatePropertyCondition(
                                UIA_ControlTypePropertyId,
                                &VARIANT::from(UIA_DocumentControlTypeId.0),
                            )
                            .ok()?;
                        let in_page = match root.FindFirst(TreeScope_Descendants, &is_document) {
                            Ok(document) => self.is_inside(&candidate, &document, &root),
                            Err(_) => false,
                        };
                        (!in_page).then_some(candidate)
                    }
                }
            }
        }

        /// Whether `element` sits somewhere under `ancestor`. Anything too
        /// deep to settle counts as inside, so an unclear answer never lets a
        /// page's text box be read as the address.
        unsafe fn is_inside(
            &self,
            element: &IUIAutomationElement,
            ancestor: &IUIAutomationElement,
            root: &IUIAutomationElement,
        ) -> bool {
            let Ok(walker) = self.automation.RawViewWalker() else {
                return true;
            };
            let same = |a: &IUIAutomationElement, b: &IUIAutomationElement| {
                self.automation
                    .CompareElements(a, b)
                    .map(|same| same.as_bool())
                    .unwrap_or(false)
            };
            let mut current = element.clone();
            for _ in 0..MAX_ANCESTOR_DEPTH {
                let Ok(parent) = walker.GetParentElement(&current) else {
                    return false;
                };
                if same(&parent, ancestor) {
                    return true;
                }
                if same(&parent, root) {
                    return false;
                }
                current = parent;
            }
            true
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

    /// The address a browser window shows, or `None` when it can't be read.
    pub fn browser_address(handle: isize, browser: Browser) -> Option<String> {
        let hwnd = HWND(handle as *mut std::ffi::c_void);
        Uia::new().ok()?.address(hwnd, browser)
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

    pub fn type_into(target: &Target, steps: &[AutoTypeStep]) -> Result<(), String> {
        let hwnd = HWND(target.handle as *mut std::ffi::c_void);

        // SAFETY: `hwnd` came from `GetForegroundWindow` in this process. A
        // window closed since then simply fails these calls, which is why the
        // focus result is checked before any input is sent.
        if !unsafe { focus(hwnd) } {
            return Err("Could not bring the target window back to the front".into());
        }
        sleep(FOCUS_SETTLE);

        if let Some(browser) = target.browser.filter(|_| target.url.is_some()) {
            let current = Uia::new()?.address(hwnd, browser);
            check_address(target, current.as_deref())?;
        }

        // Created on the first `Focus` step, so COM is only touched when
        // there is a field to find.
        let mut uia: Option<Uia> = None;

        for step in steps {
            // Every step sends keystrokes (a `Focus` step sends Ctrl+A), so
            // look again right before each one.
            // SAFETY: plain Win32 queries; a stale `hwnd` just yields an
            // empty title, which fails the check.
            let (foreground, title) =
                unsafe { (GetForegroundWindow().0 as isize, window_title(hwnd)) };
            check_target(target, foreground, &title)?;

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
    use super::{AutoTypeStep, Browser, CapturedWindow, FormLayout, Target};

    pub fn foreground_window() -> Option<CapturedWindow> {
        None
    }

    pub fn browser_address(_handle: isize, _browser: Browser) -> Option<String> {
        None
    }

    pub fn inspect(_handle: isize) -> Result<FormLayout, String> {
        Ok(FormLayout::default())
    }

    pub fn type_into(_target: &Target, _steps: &[AutoTypeStep]) -> Result<(), String> {
        Err("Auto-type is only implemented on Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        address_from, browser_for, check_address, check_target, pick_fields, AutoTypeStep, Browser,
        FieldInfo, FieldPicks, FormField, FormLayout, Target,
    };

    #[test]
    fn recognises_browsers_by_executable_whatever_the_case() {
        assert_eq!(browser_for("chrome.exe"), Some(Browser::Chromium));
        assert_eq!(browser_for("MSEDGE.EXE"), Some(Browser::Chromium));
        assert_eq!(browser_for("brave.exe"), Some(Browser::Chromium));
        assert_eq!(browser_for("firefox.exe"), Some(Browser::Firefox));
        assert_eq!(browser_for("LibreWolf.exe"), Some(Browser::Firefox));
    }

    #[test]
    fn treats_everything_else_as_not_a_browser() {
        assert_eq!(browser_for("notepad.exe"), None);
        assert_eq!(browser_for(""), None);
        // Close isn't enough: the address bar lookup is specific to each family.
        assert_eq!(browser_for("chrome_proxy.exe"), None);
    }

    #[test]
    fn reads_an_address_as_the_bar_shows_it() {
        assert_eq!(
            address_from("  github.com/login  "),
            Some("github.com/login".to_string())
        );
        assert_eq!(
            address_from("https://accounts.google.com/"),
            Some("https://accounts.google.com/".to_string())
        );
    }

    #[test]
    fn reads_no_address_from_an_empty_bar_or_search_terms() {
        assert_eq!(address_from(""), None);
        assert_eq!(address_from("   "), None);
        assert_eq!(address_from("github login page"), None);
    }

    fn github_tab() -> Target {
        Target {
            handle: 42,
            title: "Sign in to GitHub - Firefox".into(),
            browser: Some(Browser::Firefox),
            url: Some("https://github.com/login".into()),
        }
    }

    #[test]
    fn accepts_a_page_still_at_the_address_it_was_matched_on() {
        assert_eq!(
            check_address(&github_tab(), Some("https://github.com/login")),
            Ok(())
        );
    }

    #[test]
    fn stops_when_the_page_navigated_elsewhere_or_the_address_went_unreadable() {
        let expected = Err("The page's address changed; auto-type was stopped".to_string());
        assert_eq!(
            check_address(&github_tab(), Some("https://evil.example")),
            expected
        );
        assert_eq!(check_address(&github_tab(), None), expected);
    }

    #[test]
    fn has_nothing_to_check_when_no_address_was_read() {
        let notepad = Target {
            url: None,
            browser: None,
            ..github_tab()
        };
        assert_eq!(check_address(&notepad, Some("anything")), Ok(()));
    }

    #[test]
    fn allows_typing_while_the_same_window_and_title_are_in_front() {
        assert!(check_target(&github_tab(), 42, "Sign in to GitHub - Firefox").is_ok());
    }

    #[test]
    fn stops_when_another_window_is_in_front() {
        assert!(check_target(&github_tab(), 7, "Sign in to GitHub - Firefox").is_err());
    }

    #[test]
    fn stops_when_the_browser_switched_to_another_tab() {
        assert!(check_target(&github_tab(), 42, "Evil page - Firefox").is_err());
    }

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
