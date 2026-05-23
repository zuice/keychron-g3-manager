use serde::{Deserialize, Deserializer, Serialize, Serializer};

const VID: u16 = 0x3434;
const PIDS: &[u16] = &[0xD028, 0xD06E];

const REPORT_SHORT_OUT: u8 = 0xB5;
const REPORT_LONG_OUT: u8 = 0xB3;
const REPORT_LONG_IN: u8 = 0xB4;
const REPORT_SHORT_IN: u8 = 0xB6;

const LONG_SIZE: usize = 64;

const CMD_SETTINGS: u8 = 0x06;
const CMD_SET_DPI: u8 = 0x40;
const CMD_SET_POLLING: u8 = 0x41;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MouseSettings {
    pub dpi_slots: [u16; 5],
    pub active_dpi_slot: u8,
    pub dpi_stage_count: u8,
    pub polling_rate: PollingRate,
    pub available_polling_rates: Vec<u8>,
    pub battery_percent: u8,
    pub battery_charging: bool,
}

#[derive(Debug, Clone, Copy)]
pub enum PollingRate {
    Hz125 = 0,
    Hz500 = 1,
    Hz1000 = 2,
    Hz2000 = 3,
    Hz4000 = 4,
    Hz8000 = 5,
}

impl Serialize for PollingRate {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u8(*self as u8)
    }
}

impl<'de> Deserialize<'de> for PollingRate {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let code = u8::deserialize(deserializer)?;
        PollingRate::from_code(code)
            .ok_or_else(|| serde::de::Error::custom(format!("invalid polling rate code: {code}")))
    }
}

impl PollingRate {
    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            0 => Some(Self::Hz125),
            1 => Some(Self::Hz500),
            2 => Some(Self::Hz1000),
            3 => Some(Self::Hz2000),
            4 => Some(Self::Hz4000),
            5 => Some(Self::Hz8000),
            _ => None,
        }
    }
}

fn open_device() -> Result<hidapi::HidDevice, String> {
    let api = hidapi::HidApi::new().map_err(|e| format!("HID init failed: {e}"))?;

    for info in api.device_list() {
        if info.vendor_id() == VID
            && PIDS.contains(&info.product_id())
            && info.usage_page() == 0xFFC1
        {
            return info
                .open_device(&api)
                .map_err(|e| format!("Open failed: {e}"));
        }
    }

    Err("Keychron G3 not found. Make sure it is connected.".into())
}

fn send_report(dev: &hidapi::HidDevice, report_id: u8, data: &[u8]) -> Result<(), String> {
    let mut buf = vec![report_id];
    buf.extend_from_slice(data);
    let written = dev.write(&buf).map_err(|e| format!("Write failed: {e}"))?;
    if written == 0 {
        return Err("Write returned 0 bytes".into());
    }
    Ok(())
}

fn read_report(dev: &hidapi::HidDevice, timeout_ms: i32) -> Result<Vec<u8>, String> {
    let mut buf = vec![0u8; LONG_SIZE];
    let read = dev
        .read_timeout(&mut buf, timeout_ms)
        .map_err(|e| format!("Read failed: {e}"))?;
    if read == 0 {
        return Err("Read timeout".into());
    }
    buf.truncate(read);
    Ok(buf)
}

fn read_u16_le(data: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([data[offset], data[offset + 1]])
}

fn write_u16_le(val: u16) -> [u8; 2] {
    val.to_le_bytes()
}

fn read_response(dev: &hidapi::HidDevice, expected_cmd: u8) -> Result<Vec<u8>, String> {
    for _ in 0..10 {
        let resp = match read_report(dev, 2000) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if resp.is_empty() {
            continue;
        }
        let cmd_byte = match resp[0] {
            REPORT_LONG_IN | REPORT_SHORT_IN => resp.get(1).copied().unwrap_or(0),
            _ => resp[0],
        };
        if cmd_byte == 0xE4 {
            continue;
        }
        if cmd_byte == expected_cmd {
            return Ok(match resp[0] {
                REPORT_LONG_IN | REPORT_SHORT_IN => resp[1..].to_vec(),
                _ => resp,
            });
        }
    }
    Err(format!(
        "No response for cmd 0x{:02X}",
        expected_cmd
    ))
}

pub fn read_settings() -> Result<MouseSettings, String> {
    let dev = open_device()?;

    let mut payload = vec![CMD_SETTINGS, 0x00];
    payload.resize(63, 0x00);
    send_report(&dev, REPORT_LONG_OUT, &payload)?;

    let d = read_response(&dev, CMD_SETTINGS)?;
    let d = &d[..];

    let mut dpi_slots = [0u16; 5];
    for i in 0..5 {
        dpi_slots[i] = read_u16_le(d, 5 + i * 2);
    }

    let active_dpi_slot = d.get(4).copied().unwrap_or(0);
    let dpi_stage_count = d.get(16).copied().unwrap_or(5).min(5);
    let polling_code = d.get(43).copied().unwrap_or(2);
    let polling_rate = PollingRate::from_code(polling_code).unwrap_or(PollingRate::Hz1000);

    let mut available_polling_rates = vec![polling_code];
    for i in 44..49 {
        if let Some(&code) = d.get(i) {
            if code > 0 && !available_polling_rates.contains(&code) {
                available_polling_rates.push(code);
            }
        }
    }
    available_polling_rates.sort();

    let raw_battery = d.get(19).copied().unwrap_or(0);

    Ok(MouseSettings {
        dpi_slots,
        active_dpi_slot,
        dpi_stage_count,
        polling_rate,
        available_polling_rates,
        battery_percent: raw_battery & 0x7F,
        battery_charging: (raw_battery & 0x80) != 0,
    })
}

pub fn set_dpi(slots: [u16; 5], active_slot: u8, stage_count: u8) -> Result<(), String> {
    let dev = open_device()?;

    let mut data = vec![CMD_SET_DPI, active_slot, active_slot, active_slot];
    for slot in &slots {
        data.extend_from_slice(&write_u16_le(*slot));
    }
    data.push(stage_count);
    data.resize(20, 0x00);

    send_report(&dev, REPORT_SHORT_OUT, &data)?;
    let _ = read_report(&dev, 1000);

    let mut commit = vec![CMD_SETTINGS, 0x00];
    commit.resize(63, 0x00);
    send_report(&dev, REPORT_LONG_OUT, &commit)?;
    let _ = read_report(&dev, 1000);

    Ok(())
}

pub fn set_polling_rate(rate: PollingRate) -> Result<(), String> {
    let dev = open_device()?;

    let mut data = vec![0u8; 20];
    data[0] = CMD_SET_POLLING;
    data[3] = rate as u8;
    data[9] = 0x01;

    send_report(&dev, REPORT_SHORT_OUT, &data)?;
    let _ = read_report(&dev, 1000);

    let mut commit = vec![CMD_SETTINGS, 0x00];
    commit.resize(63, 0x00);
    send_report(&dev, REPORT_LONG_OUT, &commit)?;
    let _ = read_report(&dev, 1000);

    Ok(())
}
