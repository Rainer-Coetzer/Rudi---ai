//! Ollama daemon bootstrap: point it at Rudi's models dir (if one is configured),
//! start it if it isn't already serving, and pull any of Rudi's models that are missing.

use crate::sidecar::log_activity;
use std::net::{SocketAddr, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::AppHandle;

/// Where models lived when the path was hard-coded; still used if it exists.
const LEGACY_MODELS_DIR: &str = r"D:\Rudi\models";
const RUDI_MODELS: [&str; 4] = ["llama3.2:1b", "qwen2.5-coder:1.5b", "qwen3:0.6b", "deepseek-r1:1.5b"];

/// The daemon we spawned, if any (None when Ollama was already running).
static DAEMON: Mutex<Option<Child>> = Mutex::new(None);

pub fn shutdown() {
    if let Some(mut child) = DAEMON.lock().unwrap().take() {
        eprintln!("[OLLAMA] Stopping daemon...");
        let _ = child.kill();
    }
}

fn command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn is_serving() -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], 11434).into();
    TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
}

fn installed_models() -> Option<Vec<String>> {
    let out = command("ollama").arg("list").output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .skip(1) // header
            .filter_map(|l| l.split_whitespace().next().map(str::to_string))
            .collect(),
    )
}

/// `RUDI_MODELS_DIR`, else the legacy dir if it holds models. None leaves Ollama
/// on its own setting (`OLLAMA_MODELS`, or ~/.ollama/models), shared with other tools.
fn models_dir() -> Option<String> {
    if let Some(dir) = std::env::var("RUDI_MODELS_DIR").ok().filter(|d| !d.is_empty()) {
        return Some(dir);
    }
    std::path::Path::new(LEGACY_MODELS_DIR)
        .is_dir()
        .then(|| LEGACY_MODELS_DIR.to_string())
}

/// Runs on a background thread; never blocks startup.
pub fn bootstrap(app: AppHandle) {
    std::thread::spawn(move || {
        if let Some(models_dir) = models_dir() {
            let _ = std::fs::create_dir_all(&models_dir);
            // Children (ollama serve / pull) inherit this.
            std::env::set_var("OLLAMA_MODELS", &models_dir);

            #[cfg(windows)]
            {
                // Persist for future OS sessions (HKCU user env — no admin needed),
                // so a tray-started Ollama finds the same models.
                let _ = command("setx").args(["OLLAMA_MODELS", &models_dir]).stdout(Stdio::null()).spawn();
            }
            eprintln!("[OLLAMA] OLLAMA_MODELS={models_dir}");
        } else {
            eprintln!("[OLLAMA] Using Ollama's default models dir.");
        }

        if is_serving() {
            eprintln!("[OLLAMA] Already running — skipping daemon spawn.");
        } else {
            eprintln!("[OLLAMA] Spawning local daemon...");
            match command("ollama").arg("serve").stdout(Stdio::null()).stderr(Stdio::null()).spawn() {
                Ok(child) => *DAEMON.lock().unwrap() = Some(child),
                Err(e) => {
                    eprintln!("[OLLAMA] Failed to start. Is it installed? {e}");
                    return;
                }
            }
            std::thread::sleep(Duration::from_secs(2));
        }

        let Some(installed) = installed_models() else {
            eprintln!("[OLLAMA] Not responding. Rudi may run in text-only mode.");
            return;
        };
        log_activity(&app, format!("Ollama ready. Installed: {}", installed.join(", ")));

        for model in RUDI_MODELS.iter().filter(|m| !installed.iter().any(|i| i == *m)) {
            eprintln!("[OLLAMA] Pulling missing model: {model}");
            log_activity(&app, format!("Pulling model: {model}"));
            match command("ollama").args(["pull", model]).stdout(Stdio::null()).stderr(Stdio::null()).status() {
                Ok(s) if s.success() => eprintln!("[OLLAMA] Model ready: {model}"),
                _ => eprintln!("[OLLAMA] Failed to pull {model}"),
            }
        }
    });
}
