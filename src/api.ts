import { invoke } from "@tauri-apps/api/core";

export interface MouseSettings {
  dpi_slots: [number, number, number, number, number];
  active_dpi_slot: number;
  dpi_stage_count: number;
  polling_rate: number;
  available_polling_rates: number[];
  battery_percent: number;
  battery_charging: boolean;
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
