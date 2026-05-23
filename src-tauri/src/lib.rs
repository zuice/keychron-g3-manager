mod mouse;

use mouse::{MouseSettings, PollingRate};
use serde::Deserialize;

#[derive(Deserialize)]
struct DpiPayload {
    slots: [u16; 5],
    active_slot: u8,
    stage_count: u8,
}

#[tauri::command]
fn get_settings() -> Result<MouseSettings, String> {
    mouse::read_settings()
}

#[tauri::command]
fn set_dpi(payload: DpiPayload) -> Result<(), String> {
    mouse::set_dpi(payload.slots, payload.active_slot, payload.stage_count)
}

#[tauri::command]
fn set_polling_rate(rate_code: u8) -> Result<(), String> {
    let rate = PollingRate::from_code(rate_code)
        .ok_or_else(|| format!("Invalid polling rate code: {rate_code}"))?;
    mouse::set_polling_rate(rate)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_dpi,
            set_polling_rate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
