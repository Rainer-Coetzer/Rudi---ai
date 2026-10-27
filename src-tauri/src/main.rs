// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod awareness;
mod ollama;
mod sidecar;

use serde_json::{json, Value};
use sidecar::Sidecar;
use std::sync::Arc;
use tauri::{AppHandle, LogicalPosition, Manager, RunEvent, State, WebviewWindow, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::ShortcutState;

const GHOST_HOTKEY: &str = "CommandOrControl+Alt+R";

/// Sidecar methods the renderer may call. `confirmResult` is deliberately absent:
/// only the shell's native approval dialog may answer the sidecar's approval gate.
const RENDERER_METHODS: &[&str] = &[
    "executeTool",
    "appendLog",
    "getLogs",
    "getToolSchemas",
    "executeMcpTool",
    "getProjectContext",
    "getWorkspace",
    "setWorkspace",
    "setAutonomyLevel",
];

#[tauri::command]
async fn sidecar_call(
    method: String,
    params: Option<Value>,
    sidecar: State<'_, Arc<Sidecar>>,
) -> Result<Value, String> {
    if !RENDERER_METHODS.contains(&method.as_str()) {
        return Err(format!("method not allowed: {method}"));
    }
    sidecar.call(&method, params.unwrap_or(Value::Null)).await
}

#[tauri::command]
async fn pick_workspace(app: AppHandle, sidecar: State<'_, Arc<Sidecar>>) -> Result<Option<String>, String> {
    let current = sidecar.call("getWorkspace", Value::Null).await.ok();

    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut dialog = app.dialog().file().set_title("Select Active Workspace");
    if let Some(dir) = current.as_ref().and_then(Value::as_str) {
        dialog = dialog.set_directory(dir);
    }
    if let Some(main) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&main);
    }
    dialog.pick_folder(move |folder| {
        let _ = tx.send(folder);
    });

    let Some(folder) = rx.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let chosen = folder.into_path().map_err(|e| e.to_string())?.display().to_string();
    let ok = sidecar.call("setWorkspace", json!({ "path": chosen })).await?;
    Ok(if ok.as_bool() == Some(true) { Some(chosen) } else { None })
}

#[tauri::command]
fn window_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn window_maximize(window: WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn window_close(window: WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
fn window_is_maximized(window: WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

fn toggle_ghost(app: &AppHandle) {
    let Some(ghost) = app.get_webview_window("ghost") else { return };
    if ghost.is_visible().unwrap_or(false) {
        let _ = ghost.hide();
    } else {
        let _ = ghost.show();
        let _ = ghost.set_focus();
    }
}

/// Centered horizontally, upper 20% of the primary screen.
fn position_ghost(ghost: &WebviewWindow) {
    let Ok(Some(monitor)) = ghost.primary_monitor() else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (w, h) = (area.size.width as f64 / scale, area.size.height as f64 / scale);
    let x = area.position.x as f64 / scale + ((w - 600.0) / 2.0).floor();
    let y = area.position.y as f64 / scale + (h * 0.2).floor();
    let _ = ghost.set_position(LogicalPosition::new(x, y));
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([GHOST_HOTKEY])
                .expect("invalid ghost hotkey")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_ghost(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();
            let sidecar = Sidecar::spawn(&handle)?;
            app.manage(sidecar);

            ollama::bootstrap(handle.clone());
            awareness::start(handle);

            if let Some(ghost) = app.get_webview_window("ghost") {
                position_ghost(&ghost);
            }
            Ok(())
        })
        .on_window_event(|window, event| match (window.label(), event) {
            ("ghost", WindowEvent::Focused(false)) => {
                let _ = window.hide();
            }
            // The hidden ghost window would otherwise keep the app alive.
            ("main", WindowEvent::Destroyed) => window.app_handle().exit(0),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            sidecar_call,
            pick_workspace,
            window_minimize,
            window_maximize,
            window_close,
            window_is_maximized,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Rudi");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(sidecar) = app.try_state::<Arc<Sidecar>>() {
                sidecar.kill();
            }
            ollama::shutdown();
        }
    });
}
