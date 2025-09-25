use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Result as NotifyResult, Watcher};
use tauri::{AppHandle, State};

#[derive(Default)]
pub struct NotesWatcherState {
    inner: Mutex<Option<WatcherGuard>>,
}

struct WatcherGuard {
    root: PathBuf,
    watcher: Option<RecommendedWatcher>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl WatcherGuard {
    fn stop(&mut self) {
        if let Some(mut watcher) = self.watcher.take() {
            let _ = watcher.unwatch(Path::new(&self.root));
        }
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for WatcherGuard {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn spawn_fs_watcher(app_handle: AppHandle, root: PathBuf) -> NotifyResult<WatcherGuard> {
    let (tx, rx) = std::sync::mpsc::channel();

    let mut watcher = RecommendedWatcher::new(tx, notify::Config::default())?;
    watcher.watch(Path::new(&root), RecursiveMode::Recursive)?;

    let thread = std::thread::spawn(move || {
        for result in rx {
            match result {
                Ok(event) => {
                    let payload = serde_json::to_string(
                        &event
                            .paths
                            .into_iter()
                            .filter_map(|path| path.to_str().map(|value| value.to_string()))
                            .collect::<Vec<String>>(),
                    )
                    .unwrap_or_else(|_| "[]".to_string());
                    let _ = app_handle.emit("notes://fs", payload);
                }
                Err(err) => {
                    let payload = format!(r#"{{"error":"{}"}}"#, err);
                    let _ = app_handle.emit("notes://fs", payload);
                }
            }
        }
    });

    Ok(WatcherGuard {
        root,
        watcher: Some(watcher),
        thread: Some(thread),
    })
}

impl NotesWatcherState {
    pub fn set_root(&self, app: &AppHandle, root: PathBuf) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Failed to lock notes watcher state".to_string())?;

        if let Some(mut existing) = guard.take() {
            existing.stop();
        }

        let watcher = spawn_fs_watcher(app.clone(), root)
            .map_err(|error| format!("Failed to initialize notes watcher: {error}"))?;

        *guard = Some(watcher);

        Ok(())
    }
}

#[tauri::command]
pub async fn set_notes_root(
    path: String,
    app: AppHandle,
    state: State<'_, NotesWatcherState>,
) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Path must not be empty".to_string());
    }

    state.set_root(&app, PathBuf::from(path))
}
