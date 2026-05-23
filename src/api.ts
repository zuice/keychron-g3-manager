import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

export interface MouseSettings {
  dpi_slots: [number, number, number, number, number];
  active_dpi_slot: number;
  dpi_stage_count: number;
  polling_rate: number;
  available_polling_rates: number[];
  battery_percent: number;
  battery_charging: boolean;
}

export interface Profile {
  id: number;
  name: string;
  dpi: number;
  polling_rate: number;
  is_default: boolean;
}

interface DbProfileRow {
  id: number;
  name: string;
  dpi: number;
  polling_rate: number;
  is_default: number;
}

interface SettingsRow {
  active_profile_id: number;
}

export const POLLING_RATES = [
  { code: 0, label: "125 Hz" },
  { code: 1, label: "500 Hz" },
  { code: 2, label: "1000 Hz" },
  { code: 3, label: "2000 Hz" },
  { code: 4, label: "4000 Hz" },
  { code: 5, label: "8000 Hz" },
];

export const DPI_MIN = 100;
export const DPI_MAX = 30000;
export const DPI_STEP = 100;

let _db: Database | null = null;
let _dbPromise: Promise<Database> | null = null;

async function db(): Promise<Database> {
  if (_db) return _db;
  if (!_dbPromise) {
    _dbPromise = Database.load("sqlite:profiles.db").then((d) => {
      _db = d;
      return d;
    });
  }
  return _dbPromise;
}

export async function fetchSettings(): Promise<MouseSettings> {
  return invoke<MouseSettings>("get_settings");
}

export async function applyDpi(
  slots: [number, number, number, number, number],
  activeSlot: number,
  stageCount: number,
): Promise<void> {
  return invoke("set_dpi", {
    payload: { slots, active_slot: activeSlot, stage_count: stageCount },
  });
}

export async function applyPollingRate(rateCode: number): Promise<void> {
  return invoke("set_polling_rate", { rateCode });
}

export async function fetchProfiles(): Promise<Profile[]> {
  const d = await db();
  const rows = await d.select<DbProfileRow[]>(
    "SELECT * FROM profiles ORDER BY id",
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    dpi: r.dpi,
    polling_rate: r.polling_rate,
    is_default: !!r.is_default,
  }));
}

export async function createProfile(name: string): Promise<Profile> {
  const d = await db();
  const result = await d.execute(
    "INSERT INTO profiles (name, dpi, polling_rate) VALUES ($1, 1600, 2)",
    [name],
  );
  const rows = await d.select<DbProfileRow[]>(
    "SELECT * FROM profiles WHERE id = $1",
    [result.lastInsertId],
  );
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    dpi: r.dpi,
    polling_rate: r.polling_rate,
    is_default: !!r.is_default,
  };
}

export async function updateProfile(
  id: number,
  name?: string,
  dpi?: number,
  pollingRate?: number,
): Promise<void> {
  const d = await db();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (name !== undefined) {
    sets.push("name = $1");
    vals.push(name);
  }
  if (dpi !== undefined) {
    sets.push(`dpi = $${vals.length + 1}`);
    vals.push(dpi);
  }
  if (pollingRate !== undefined) {
    sets.push(`polling_rate = $${vals.length + 1}`);
    vals.push(pollingRate);
  }
  if (sets.length === 0) return;
  vals.push(id);
  await d.execute(
    `UPDATE profiles SET ${sets.join(", ")} WHERE id = $${vals.length}`,
    vals,
  );
}

export async function deleteProfile(id: number): Promise<void> {
  const d = await db();
  await d.execute("DELETE FROM profiles WHERE id = $1 AND is_default = 0", [
    id,
  ]);
}

export async function fetchActiveProfileId(): Promise<number> {
  const d = await db();
  const rows = await d.select<SettingsRow[]>(
    "SELECT active_profile_id FROM settings WHERE id = 1",
  );
  return rows[0]?.active_profile_id ?? 1;
}

export async function setActiveProfileId(id: number): Promise<void> {
  const d = await db();
  await d.execute("UPDATE settings SET active_profile_id = $1 WHERE id = 1", [
    id,
  ]);
}
