//! Active-window awareness: polls the foreground app, tells the renderer which
//! mode Rudi is in, and docks the main window out of the way while coding/browsing.

use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow};

const POLL_INTERVAL: Duration = Duration::from_millis(1500);

fn classify(app_name: &str, title: &str) -> &'static str {
    let app_name = app_name.to_lowercase();
    let title = title.to_lowercase();
    if app_name.contains("code") || title.contains("visual studio code") {
        "coding"
    } else if ["chrome", "msedge", "firefox"].iter().any(|b| app_name.contains(b)) {
        "web"
    } else {
        "idle"
    }
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut current = "idle";
        loop {
            std::thread::sleep(POLL_INTERVAL);
            let Ok(active) = active_win_pos_rs::get_active_window() else { continue };
            let mode = classify(&active.app_name, &active.title);
            if mode == current {
                continue;
            }
            current = mode;
            eprintln!("[AWARENESS] Switched to {mode} mode (App: {})", active.app_name);

            let Some(main) = app.get_webview_window("main") else { continue };
            let _ = main.emit("active-mode-changed", mode);
            if mode != "idle" {
                apply_layout(&main, mode);
            }
        }
    });
}

/// Same presets the Electron build used, in logical (DPI-independent) pixels.
pub fn apply_layout(window: &WebviewWindow, mode: &str) {
    let Ok(Some(monitor)) = window.primary_monitor() else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (x0, y0) = (area.position.x as f64 / scale, area.position.y as f64 / scale);
    let (w, h) = (area.size.width as f64 / scale, area.size.height as f64 / scale);

    let place = |width: f64, height: f64, pos: Option<(f64, f64)>| {
        let _ = window.set_size(LogicalSize::new(width, height));
        match pos {
            Some((x, y)) => {
                let _ = window.set_position(LogicalPosition::new(x0 + x, y0 + y));
            }
            None => {
                let _ = window.center();
            }
        }
    };

    match mode {
        "idle" => place(1400.0, 900.0, None),
        "coding" => place(450.0, 600.0, Some((w - 460.0, h - 610.0))),
        "web" => place(450.0, 600.0, Some((w - 460.0, 10.0))),
        "side" => place(500.0, h - 40.0, Some((w - 510.0, 20.0))),
        "full" => place(w - 100.0, h - 100.0, None),
        _ => {}
    }
}
