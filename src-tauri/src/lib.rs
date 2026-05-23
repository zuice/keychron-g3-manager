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
    let migrations = vec![tauri_plugin_sql::Migration {
        version: 1,
        description: "create profiles table",
        sql: "CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                dpi INTEGER NOT NULL DEFAULT 1600,
                polling_rate INTEGER NOT NULL DEFAULT 2,
                is_default INTEGER NOT NULL DEFAULT 0
            );
            INSERT OR IGNORE INTO profiles (id, name, dpi, polling_rate, is_default)
                VALUES (1, 'Standard', 1600, 2, 1);
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                active_profile_id INTEGER NOT NULL DEFAULT 1
            );
            INSERT OR IGNORE INTO settings (id, active_profile_id) VALUES (1, 1);",
        kind: tauri_plugin_sql::MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:profiles.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_dpi,
            set_polling_rate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
