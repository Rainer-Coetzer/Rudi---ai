//! Node sidecar: hosts the tool layer (sidecar/index.ts) and talks to it over
//! newline-delimited JSON on stdin/stdout. See sidecar/stdio.ts for the protocol.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::oneshot;

type Reply = Result<Value, String>;
type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Reply>>>>;

pub struct Sidecar {
    stdin: Mutex<ChildStdin>,
    child: Mutex<Child>,
    pending: Pending,
    next_id: AtomicU64,
}

/// (node binary, entry script, working directory)
fn locate(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    if cfg!(debug_assertions) {
        // `tauri dev`: system Node + the bundle from `npm run build:sidecar`.
        // cwd is the repo root so getRudiRoot() and sidecar/plugins resolve as before.
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let root = root.canonicalize().unwrap_or(root);
        Ok((PathBuf::from("node"), root.join("dist-sidecar").join("index.mjs"), root))
    } else {
        // Bundled: node is an externalBin next to our exe, script + plugins are resources.
        let exe_dir = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .ok_or("exe has no parent dir")?
            .to_path_buf();
        let node = exe_dir.join(if cfg!(windows) { "node.exe" } else { "node" });
        let res = app.path().resource_dir().map_err(|e| e.to_string())?;
        Ok((node, res.join("sidecar").join("index.mjs"), res))
    }
}

impl Sidecar {
    pub fn spawn(app: &AppHandle) -> Result<Arc<Self>, String> {
        let (node, script, cwd) = locate(app)?;

        let mut cmd = Command::new(&node);
        cmd.arg(&script)
            .current_dir(&cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to start sidecar ({}): {e}", node.display()))?;
        let stdin = child.stdin.take().ok_or("sidecar stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("sidecar stdout unavailable")?;

        let pending: Pending = Arc::default();
        let reader_pending = pending.clone();
        let handle = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let Ok(msg) = serde_json::from_str::<Value>(&line) else {
                    eprintln!("[SIDECAR] non-protocol output: {line}");
                    continue;
                };
                if let Some(id) = msg.get("id").and_then(Value::as_u64) {
                    let reply = match msg.get("error") {
                        Some(err) => Err(err.as_str().unwrap_or("sidecar error").to_string()),
                        None => Ok(msg.get("result").cloned().unwrap_or(Value::Null)),
                    };
                    if let Some(tx) = reader_pending.lock().unwrap().remove(&id) {
                        let _ = tx.send(reply);
                    }
                } else if let Some(event) = msg.get("event").and_then(Value::as_str) {
                    on_event(&handle, event, msg.get("payload").cloned().unwrap_or(Value::Null));
                }
            }
            eprintln!("[SIDECAR] exited");
            for (_, tx) in reader_pending.lock().unwrap().drain() {
                let _ = tx.send(Err("sidecar exited".into()));
            }
        });

        Ok(Arc::new(Self {
            stdin: Mutex::new(stdin),
            child: Mutex::new(child),
            pending,
            next_id: AtomicU64::new(1),
        }))
    }

    pub async fn call(&self, method: &str, params: Value) -> Reply {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);

        let line = json!({ "id": id, "method": method, "params": params }).to_string();
        let written = {
            let mut stdin = self.stdin.lock().unwrap();
            writeln!(stdin, "{line}").and_then(|_| stdin.flush())
        };
        if let Err(e) = written {
            self.pending.lock().unwrap().remove(&id);
            return Err(format!("sidecar unavailable: {e}"));
        }

        rx.await.unwrap_or_else(|_| Err("sidecar dropped request".into()))
    }

    pub fn kill(&self) {
        let _ = self.child.lock().unwrap().kill();
    }
}

fn on_event(app: &AppHandle, event: &str, payload: Value) {
    match event {
        "ready" => eprintln!("[SIDECAR] ready"),
        "notify" => {
            let title = payload.get("title").and_then(Value::as_str).unwrap_or("Rudi");
            let body = payload.get("body").and_then(Value::as_str).unwrap_or("");
            if let Err(e) = app.notification().builder().title(title).body(body).show() {
                eprintln!("[SIDECAR] notification failed: {e}");
            }
        }
        other => {
            let _ = app.emit(&format!("sidecar:{other}"), payload);
        }
    }
}

/// Fire-and-forget activity log entry, written by the sidecar's logger.
pub fn log_activity(app: &AppHandle, message: String) {
    let Some(sidecar) = app.try_state::<Arc<Sidecar>>().map(|s| s.inner().clone()) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let _ = sidecar
            .call("appendLog", json!({ "category": "activity", "source": "System", "message": message }))
            .await;
    });
}
