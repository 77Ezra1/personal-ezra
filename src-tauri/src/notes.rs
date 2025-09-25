use std::path::PathBuf;
use std::sync::Mutex;

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct NotesWatcherState {
  inner: Mutex<Option<ActiveWatcher>>,
}

struct ActiveWatcher {
  watcher: RecommendedWatcher,
  path: PathBuf,
}

#[derive(Serialize, Clone)]
struct NotesFsEvent {
  kind: String,
  paths: Vec<String>,
}

impl NotesWatcherState {
  fn set_root(&self, app: &AppHandle, root: PathBuf) -> Result<(), String> {
    let mut guard = self.inner.lock().map_err(|_| "Failed to lock notes watcher state".to_string())?;

    if let Some(mut existing) = guard.take() {
      if let Err(error) = existing.watcher.unwatch(&existing.path) {
        eprintln!("Failed to unwatch previous notes directory: {error}");
      }
    }

    let app_handle = app.clone();
    let event_root = root.clone();

    let mut watcher = RecommendedWatcher::new(
      move |result| match result {
        Ok(event) => {
          let payload = NotesFsEvent {
            kind: format!("{:?}", event.kind),
            paths: event
              .paths
              .iter()
              .filter_map(|path| path.to_str().map(|value| value.to_string()))
              .collect(),
          };
          if let Err(error) = app_handle.emit_all("notes://fs", payload) {
            eprintln!("Failed to emit notes fs event: {error}");
          }
        }
        Err(error) => {
          let payload = NotesFsEvent {
            kind: format!("Error"),
            paths: vec![event_root.to_string_lossy().to_string()],
          };
          eprintln!("Notes watcher error: {error}");
          if let Err(emit_error) = app_handle.emit_all("notes://fs", payload) {
            eprintln!("Failed to emit watcher error: {emit_error}");
          }
        }
      },
      Config::default(),
    )
    .map_err(|error| format!("Failed to initialize notes watcher: {error}"))?;

    watcher
      .watch(&root, RecursiveMode::Recursive)
      .map_err(|error| format!("Failed to watch notes directory: {error}"))?;

    *guard = Some(ActiveWatcher { watcher, path: root });

    Ok(())
  }
}

#[tauri::command]
pub async fn set_notes_root(
  path: String,
  app: AppHandle,
  state: State<'_, NotesWatcherState>,
) -> Result<(), String> {
  let normalized = PathBuf::from(path);
  state.set_root(&app, normalized)
}
