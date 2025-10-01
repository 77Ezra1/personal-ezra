#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod notes;

use std::path::PathBuf;

use notes::{set_notes_root, NotesWatcherState};
use tauri::Manager;

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
