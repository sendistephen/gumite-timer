use std::{sync::Mutex, thread, time::Duration};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

/// Gap between the widget and the taskbar / Dock / screen edge, in logical px.
const MARGIN: f64 = 12.0;
const TRAY_ID: &str = "flip-tray";
const WIDGET: &str = "main";

/// Where on the screen the widget sits.
#[derive(Clone, Copy, PartialEq)]
enum Anchor {
    BottomRight,
    BottomLeft,
    TopRight,
    TopLeft,
    /// used for the "you've ignored the alarm" nudge
    Center,
}

impl Anchor {
    fn parse(s: &str) -> Self {
        match s {
            "bl" => Anchor::BottomLeft,
            "tr" => Anchor::TopRight,
            "tl" => Anchor::TopLeft,
            "center" => Anchor::Center,
            _ => Anchor::BottomRight,
        }
    }
}

/// The size (logical px) and anchor the UI last asked for, so the background
/// screen-follower can re-dock without asking the webview.
struct Layout(Mutex<(f64, f64, Anchor)>);

/// Which native glass the window got: "vibrancy" (macOS), "acrylic" (Windows) or "none".
struct GlassMode(Mutex<&'static str>);

/// Corner radius of the expanded widget, matched by the CSS.
const GLASS_RADIUS: f64 = 20.0;

// ---------------------------------------------------------------------------
// Glass: real blur of whatever is behind the widget.
// macOS: NSVisualEffectView, kept "active" so it doesn't turn flat grey while
//        another app has focus — which is always, for a widget.
// Windows 10/11: Acrylic. With the DWM shadow on, Windows 11 also rounds the
//        corners. If acrylic isn't available the UI falls back to a frosted panel.
// Must run on the main thread.
// ---------------------------------------------------------------------------
#[allow(deprecated)] // MediumLight: the only always-light material on older macOS
fn apply_glass(win: &WebviewWindow, radius: f64, light: bool) -> &'static str {
    use window_vibrancy::{apply_acrylic, apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
    if cfg!(target_os = "macos") {
        let _ = clear_vibrancy(win);
        let material = if light { NSVisualEffectMaterial::MediumLight } else { NSVisualEffectMaterial::HudWindow };
        let ok = apply_vibrancy(win, material, Some(NSVisualEffectState::Active), Some(radius)).is_ok();
        return if ok { "vibrancy" } else { "none" };
    }
    if cfg!(target_os = "windows") {
        let _ = win.set_shadow(true);
        let tint = if light { (238, 238, 244, 120) } else { (18, 18, 24, 110) };
        let ok = apply_acrylic(win, Some(tint)).is_ok();
        return if ok { "acrylic" } else { "none" };
    }
    "none"
}

// ---------------------------------------------------------------------------
// Idle time: seconds since the last keyboard/mouse input, system-wide.
// Lets the timer notice you walked away and count it as a break.
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
fn system_idle_seconds() -> f64 {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(source_state: i32, event_type: u32) -> f64;
    }
    // kCGEventSourceStateCombinedSessionState = 0, kCGAnyInputEventType = ~0
    unsafe { CGEventSourceSecondsSinceLastEventType(0, u32::MAX) }
}

#[cfg(windows)]
fn system_idle_seconds() -> f64 {
    use windows_sys::Win32::{
        System::SystemInformation::GetTickCount,
        UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
    };
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    unsafe {
        if GetLastInputInfo(&mut info) == 0 {
            return 0.0;
        }
        GetTickCount().wrapping_sub(info.dwTime) as f64 / 1000.0
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
fn system_idle_seconds() -> f64 {
    0.0
}

// ---------------------------------------------------------------------------
// macOS: turn the window into a non-activating NSPanel.
//
// A plain NSWindow stays on the Space (desktop) it was opened on, and macOS
// won't draw it over another app's full-screen Space. A non-activating panel
// that "joins all spaces" and is "full-screen auxiliary" is what menu-bar
// utilities use to float over everything, on every Space, without stealing
// focus from the app you're typing in.
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
mod mac {
    use tauri::{AppHandle, WebviewWindow};
    use tauri_nspanel::{tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt};

    tauri_panel! {
        panel!(FlipPanel {
            config: {
                can_become_key_window: true,
                can_become_main_window: false,
                becomes_key_only_if_needed: true,
                is_floating_panel: true,
                hides_on_deactivate: false
            }
        })
    }

    /// Must run on the main thread (we call it from `setup`).
    pub fn make_panel(win: &WebviewWindow) -> tauri::Result<()> {
        let panel = win.to_panel::<FlipPanel>()?;
        // Status level (25): above normal and floating windows, like menu-bar extras.
        panel.set_level(PanelLevel::Status.value());
        let _ = panel.add_style_mask(StyleMask::empty().nonactivating_panel().into());
        panel.set_collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .full_screen_auxiliary()
                .stationary()
                .ignores_cycle()
                .into(),
        );
        panel.set_hides_on_deactivate(false);
        Ok(())
    }

    /// Bring the panel to the front without activating the app. Main-thread safe.
    pub fn show(app: &AppHandle) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Ok(panel) = handle.get_webview_panel(super::WIDGET) {
                panel.show();
            }
        });
    }

    pub fn hide(app: &AppHandle) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Ok(panel) = handle.get_webview_panel(super::WIDGET) {
                panel.hide();
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/// The screen you're working on: the one under the mouse pointer.
fn active_monitor(app: &AppHandle) -> Option<Monitor> {
    if let (Ok(cursor), Ok(monitors)) = (app.cursor_position(), app.available_monitors()) {
        let hit = monitors.into_iter().find(|m| {
            let (p, s) = (m.position(), m.size());
            cursor.x >= p.x as f64
                && cursor.x < p.x as f64 + s.width as f64
                && cursor.y >= p.y as f64
                && cursor.y < p.y as f64 + s.height as f64
        });
        if hit.is_some() {
            return hit;
        }
    }
    app.get_webview_window(WIDGET)
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// Position inside the monitor's work area (which excludes the taskbar / Dock / menu bar).
fn placement(m: &Monitor, width: f64, height: f64, anchor: Anchor) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let scale = m.scale_factor();
    let area = m.work_area();
    let w = (width * scale).round() as i32;
    let h = (height * scale).round() as i32;
    let margin = (MARGIN * scale).round() as i32;
    let (left, top) = (area.position.x, area.position.y);
    let (right, bottom) = (left + area.size.width as i32, top + area.size.height as i32);
    let (x, y) = match anchor {
        Anchor::BottomRight => (right - w - margin, bottom - h - margin),
        Anchor::BottomLeft => (left + margin, bottom - h - margin),
        Anchor::TopRight => (right - w - margin, top + margin),
        Anchor::TopLeft => (left + margin, top + margin),
        Anchor::Center => (left + (area.size.width as i32 - w) / 2, top + (area.size.height as i32 - h) / 2),
    };
    (PhysicalPosition::new(x, y), PhysicalSize::new(w as u32, h as u32))
}

/// Size and position the widget on the active screen (no-op when already there).
fn place(app: &AppHandle, win: &WebviewWindow) -> Result<(), String> {
    let (w, h, anchor) = *app.state::<Layout>().0.lock().unwrap();
    let monitor = active_monitor(app).ok_or("no monitor found")?;
    let (pos, size) = placement(&monitor, w, h, anchor);
    if win.inner_size().ok() != Some(size) {
        win.set_size(size).map_err(|e| e.to_string())?;
    }
    if win.outer_position().ok() != Some(pos) {
        win.set_position(pos).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn show_widget(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    mac::show(app);
    #[cfg(not(target_os = "macos"))]
    if let Some(win) = app.get_webview_window(WIDGET) {
        let _ = win.show();
        let _ = win.set_always_on_top(true);
    }
    let _ = app.emit("widget-shown", ());
}

fn hide_widget(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    mac::hide(app);
    #[cfg(not(target_os = "macos"))]
    if let Some(win) = app.get_webview_window(WIDGET) {
        let _ = win.hide();
    }
}

fn widget_visible(app: &AppHandle) -> bool {
    app.get_webview_window(WIDGET)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

fn toggle_widget(app: &AppHandle) {
    if widget_visible(app) {
        hide_widget(app);
    } else {
        show_widget(app);
    }
}

/// Keep the widget on whichever screen you're using and on top of everything.
/// Polls gently (under 2 checks a second); does nothing unless something changed.
fn follow_active_screen(app: AppHandle) {
    thread::spawn(move || {
        let mut tick: u32 = 0;
        loop {
            thread::sleep(Duration::from_millis(600));
            tick = tick.wrapping_add(1);
            if !widget_visible(&app) {
                continue;
            }
            let Some(win) = app.get_webview_window(WIDGET) else { continue };
            let _ = place(&app, &win);
            // Re-assert "topmost" now and then: Windows can drop it when another
            // always-on-top window appears; macOS re-orders the panel to the front.
            if tick % 5 == 0 {
                #[cfg(target_os = "macos")]
                mac::show(&app);
                #[cfg(not(target_os = "macos"))]
                let _ = win.set_always_on_top(true);
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Resize the widget and pin it to a corner (or the centre) of the active screen.
#[tauri::command]
fn dock(app: AppHandle, window: WebviewWindow, width: f64, height: f64, show: bool, anchor: Option<String>) -> Result<(), String> {
    let anchor = Anchor::parse(anchor.as_deref().unwrap_or("br"));
    *app.state::<Layout>().0.lock().unwrap() = (width, height, anchor);
    place(&app, &window)?;
    if show && !widget_visible(&app) {
        show_widget(&app);
    }
    Ok(())
}

/// Which glass the UI should draw for ("vibrancy" | "acrylic" | "none").
#[tauri::command]
fn glass_mode(app: AppHandle) -> String {
    app.state::<GlassMode>().0.lock().unwrap().to_string()
}

/// Re-apply the native glass for a new shape (macOS corner radius) or theme.
#[tauri::command]
fn set_glass(app: AppHandle, radius: f64, light: bool) {
    if *app.state::<GlassMode>().0.lock().unwrap() == "none" {
        return;
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = handle.get_webview_window(WIDGET) {
            apply_glass(&win, radius, light);
        }
    });
}

/// Seconds since the last keyboard or mouse input anywhere on the system.
#[tauri::command]
fn idle_seconds() -> f64 {
    system_idle_seconds()
}

/// Save the stats JSON next to the app's data, so other tools (e.g. a daily
/// report) can read it. Returns the file path.
#[tauri::command]
fn save_stats(app: AppHandle, json: String) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("stats.json");
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// Menu-bar text next to the tray icon (macOS) and hover tooltip (Windows).
#[tauri::command]
fn set_tray(app: AppHandle, title: String, tooltip: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        #[cfg(target_os = "macos")]
        let _ = tray.set_title(if title.is_empty() { None } else { Some(title.as_str()) });
        #[cfg(not(target_os = "macos"))]
        let _ = &title;
        let _ = tray.set_tooltip(Some(tooltip.as_str()));
    }
}

// ---------------------------------------------------------------------------
// Tray + global shortcuts
// ---------------------------------------------------------------------------

/// Ctrl+Option on macOS / Ctrl+Alt on Windows — rarely used by other apps.
fn shortcut(key: Code) -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), key)
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let accel = |k: &str| Some(format!("Ctrl+Alt+{k}"));
    let show = MenuItem::with_id(app, "show", "Show / hide widget", true, accel("F"))?;
    let toggle = MenuItem::with_id(app, "toggle-timer", "Start / pause", true, accel("T"))?;
    let reset = MenuItem::with_id(app, "reset", "Reset", true, None::<&str>)?;
    let snooze = MenuItem::with_id(app, "snooze", "Snooze 5 min", true, None::<&str>)?;
    let quiet30 = MenuItem::with_id(app, "quiet-30", "Quiet for 30 min (meeting)", true, None::<&str>)?;
    let quiet60 = MenuItem::with_id(app, "quiet-60", "Quiet for 1 hour", true, None::<&str>)?;
    let quiet_off = MenuItem::with_id(app, "quiet-off", "Resume alerts", true, None::<&str>)?;
    let stats = MenuItem::with_id(app, "stats", "Today's stats…", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Presets & settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Flip Timer", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    let menu = Menu::with_items(
        app,
        &[
            &show, &sep()?, &toggle, &reset, &snooze, &sep()?, &quiet30, &quiet60, &quiet_off, &sep()?, &stats, &settings, &sep()?, &quit,
        ],
    )?;

    // A monochrome "template" icon looks native in the macOS menu bar;
    // Windows gets the full-colour app icon.
    #[cfg(target_os = "macos")]
    let icon = Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;
    #[cfg(not(target_os = "macos"))]
    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Flip Timer")
        .menu(&menu)
        // Windows: left-click toggles the widget, right-click opens the menu.
        // macOS: any click opens the menu, as menu-bar items normally do.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => toggle_widget(app),
            "quit" => app.exit(0),
            other => {
                if matches!(other, "settings" | "stats") && !widget_visible(app) {
                    show_widget(app);
                }
                let _ = app.emit("tray-action", other.to_string());
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if !cfg!(target_os = "macos") {
                    toggle_widget(tray.app_handle());
                }
            }
        });

    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);

    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let toggle_sc = shortcut(Code::KeyT);
    let widget_sc = shortcut(Code::KeyF);

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([toggle_sc, widget_sc])
                .expect("valid shortcuts")
                .with_handler(move |app, sc, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if *sc == toggle_sc {
                        let _ = app.emit("tray-action", "toggle-timer");
                    } else if *sc == widget_sc {
                        toggle_widget(app);
                    }
                })
                .build(),
        );
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .manage(Layout(Mutex::new((372.0, 274.0, Anchor::BottomRight))))
        .manage(GlassMode(Mutex::new("none")))
        .invoke_handler(tauri::generate_handler![dock, set_tray, glass_mode, set_glass, idle_seconds, save_stats])
        .setup(|app| {
            // Widget-style app on macOS: no Dock icon, lives in the menu bar.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(win) = app.get_webview_window(WIDGET) {
                let mode = apply_glass(&win, GLASS_RADIUS, false);
                *app.state::<GlassMode>().0.lock().unwrap() = mode;
                #[cfg(target_os = "macos")]
                mac::make_panel(&win)?;
                #[cfg(not(target_os = "macos"))]
                let _ = win.set_always_on_top(true);
            }

            build_tray(app.handle())?;
            follow_active_screen(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Flip Timer");
}
