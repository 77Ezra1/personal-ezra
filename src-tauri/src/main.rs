#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod notes;

#[cfg(target_os = "windows")]
use std::fs;
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::path::Path;

use notes::{set_notes_root, NotesWatcherState};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[cfg(target_os = "windows")]
fn ensure_webview2_installed() -> Result<(), String> {
    const WEBVIEW_ENV_VARS: &[&str] = &[
        "ProgramFiles",
        "ProgramFiles(x86)",
        "ProgramFiles(Arm)",
        "LOCALAPPDATA",
    ];

    fn append_runtime_base(path: &Path) -> PathBuf {
        path.join("Microsoft")
            .join("EdgeWebView")
            .join("Application")
    }

    fn runtime_version_directories(path: &Path) -> impl Iterator<Item = PathBuf> {
        let dirs: Vec<PathBuf> = match fs::read_dir(path) {
            Ok(entries) => entries
                .filter_map(|entry| entry.ok().map(|e| e.path()))
                .filter(|p| p.is_dir())
                .collect(),
            Err(_) => Vec::new(),
        };

        dirs.into_iter()
    }

    fn webview_runtime_exists(env_vars: &[&str]) -> bool {
        env_vars.iter().any(|var| {
            std::env::var(var)
                .ok()
                .and_then(|dir| {
                    let trimmed = dir.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        let base = append_runtime_base(Path::new(trimmed));
                        if base.join("msedgewebview2.exe").exists() {
                            return Some(true);
                        }

                        let found = runtime_version_directories(&base)
                            .any(|candidate| candidate.join("msedgewebview2.exe").exists());

                        Some(found)
                    }
                })
                .unwrap_or(false)
        })
    }

    if webview_runtime_exists(WEBVIEW_ENV_VARS) {
        return Ok(());
    }

    Err("Microsoft Edge WebView2 Runtime is not installed on this system.".to_string())
}

#[cfg(not(target_os = "windows"))]
fn ensure_webview2_installed() -> Result<(), String> {
    Ok(())
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_shell::init());

    builder
        .manage(NotesWatcherState::default())
        .invoke_handler(tauri::generate_handler![set_notes_root])
        .setup(|app| {
            if let Err(err) = ensure_webview2_installed() {
                let message = format!(
                    "{}\n\nPlease install the WebView2 runtime from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and restart the application.",
                    err
                );
                app.dialog()
                    .message(message)
                    .title("WebView2 Runtime Required")
                    .blocking_show();
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, err)));
            }
            if let Ok(root) = std::env::var("NOTES_ROOT") {
                if !root.trim().is_empty() {
                    let handle = app.handle();
                    let state = app.state::<NotesWatcherState>();
                    let _ = state.set_root(&handle, PathBuf::from(root));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
