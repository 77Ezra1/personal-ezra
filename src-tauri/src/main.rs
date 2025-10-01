#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod notes;

use std::path::{Path, PathBuf};

use notes::{set_notes_root, NotesWatcherState};
use tauri::Manager;

#[cfg(target_os = "windows")]
fn ensure_webview2_installed() -> Result<(), String> {
    const WEBVIEW_RELATIVE_PATH: &str = "Microsoft\\EdgeWebView\\Application\\msedgewebview2.exe";

    let env_vars = ["ProgramFiles", "ProgramFiles(x86)"];

    for var in env_vars.iter().copied() {
        if let Ok(dir) = std::env::var(var) {
            let candidate = Path::new(&dir).join(WEBVIEW_RELATIVE_PATH);
            if candidate.exists() {
                return Ok(());
            }
        }
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

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    #[cfg(not(desktop))]
    let builder = builder;

    builder
        .manage(NotesWatcherState::default())
        .invoke_handler(tauri::generate_handler![set_notes_root])
        .setup(|app| {
            if let Err(err) = ensure_webview2_installed() {
                tauri::api::dialog::blocking::message::<tauri::Wry, _>(
                    None,
                    "WebView2 Runtime Required",
                    format!(
                        "{}\n\nPlease install the WebView2 runtime from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and restart the application.",
                        err
                    ),
                );
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
