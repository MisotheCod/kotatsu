// The desktop app is a native window around the same web app the phone uses.
// It loads the app straight from the bridge (see tauri.conf.json), so it is always the newest build:
// nothing is bundled that could go stale. Mac notifications come from the notification plugin.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running the Agents desktop app");
}
