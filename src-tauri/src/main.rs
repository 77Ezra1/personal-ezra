#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // 注释此行可在 release 模式下显示控制台日志

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .run(tauri::generate_context!())
    .expect("error while running pms-web");
}
