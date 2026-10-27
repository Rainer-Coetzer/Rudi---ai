//! Express backend (backend/server.js): chat, voice and knowledge-base HTTP API.
//! Started with the app and killed on exit, unless something already serves its port.

use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const DEFAULT_PORT: u16 = 3001;

/// The backend we spawned, if any (None when one was already running).
static SERVER: Mutex<Option<Child>> = Mutex::new(None);

/// `RUDI_BACKEND_PORT`, else 3001. Passed on to the backend and the webview.
pub fn port() -> u16 {
    std::env::var("RUDI_BACKEND_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

fn is_serving(port: u16) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// Node's ESM loader can't start from a verbatim `\\?\` path (what
/// `canonicalize` and some Windows APIs return), so drop that prefix.
fn plain_path(path: PathBuf) -> PathBuf {
    match path.to_str().and_then(|p| p.strip_prefix(r"\\?\")) {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => path,
    }
}

/// (node binary, backend directory); server.js is run relative to the directory.
fn locate(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    if cfg!(debug_assertions) {
        // `tauri dev`: system Node + backend/ with its own node_modules.
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("backend");
        Ok((PathBuf::from("node"), dir))
    } else {
        // Bundled: same node externalBin as the sidecar, backend/ is a resource dir.
        let exe_dir = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .ok_or("exe has no parent dir")?
            .to_path_buf();
        let node = exe_dir.join(if cfg!(windows) { "node.exe" } else { "node" });
        let dir = app.path().resource_dir().map_err(|e| e.to_string())?.join("backend");
        Ok((node, plain_path(dir)))
    }
}

/// Never fails startup: a missing backend only disables chat/voice/knowledge.
pub fn spawn(app: &AppHandle) {
    let port = port();
    if is_serving(port) {
        eprintln!("[BACKEND] 127.0.0.1:{port} already in use — assuming a backend is running.");
        return;
    }

    let (node, cwd) = match locate(app) {
        Ok(paths) => paths,
        Err(e) => {
            eprintln!("[BACKEND] cannot locate backend: {e}");
            return;
        }
    };

    let mut cmd = Command::new(&node);
    cmd.arg("server.js").current_dir(&cwd).env("RUDI_BACKEND_PORT", port.to_string());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(child) => {
            eprintln!("[BACKEND] started (pid {}) on 127.0.0.1:{port}", child.id());
            *SERVER.lock().unwrap() = Some(child);
        }
        Err(e) => eprintln!("[BACKEND] failed to start ({}): {e}", node.display()),
    }
}

pub fn shutdown() {
    if let Some(mut child) = SERVER.lock().unwrap().take() {
        eprintln!("[BACKEND] Stopping...");
        let _ = child.kill();
        let _ = child.wait();
    }
}
