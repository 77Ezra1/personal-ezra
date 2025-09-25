#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod notes;

use notes::{set_notes_root, NotesWatcherState};

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_shell::init())
    .manage(NotesWatcherState::default())
    .invoke_handler(tauri::generate_handler![set_notes_root])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
