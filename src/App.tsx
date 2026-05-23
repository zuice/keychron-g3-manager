import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchSettings,
  applyDpi,
  applyPollingRate,
  POLLING_RATES,
  DPI_MIN,
  DPI_MAX,
  DPI_STEP,
} from "./api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { BatteryCharging, BatteryFull, BatteryMedium, BatteryLow } from "lucide-react";

function clampDpi(n: number) {
  return Math.max(DPI_MIN, Math.min(DPI_MAX, Math.round(n / DPI_STEP) * DPI_STEP));
}

function BatteryIcon({ percent, charging }: { percent: number; charging: boolean }) {
  const props = { className: "size-3.5" };
  if (charging) return <BatteryCharging {...props} />;
  if (percent > 75) return <BatteryFull {...props} />;
  if (percent > 25) return <BatteryMedium {...props} />;
  return <BatteryLow {...props} />;
}

export default function App() {
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [connected, setConnected] = useState(false);

  const [dpi, setDpi] = useState(800);
  const [dpiInput, setDpiInput] = useState("800");
  const [pollingRate, setPollingRate] = useState(2);

  const [battery, setBattery] = useState<{
    percent: number;
    charging: boolean;
  }>({ percent: 0, charging: false });

  const refreshLock = useRef(false);

  const syncDpi = useCallback((value: number) => {
    setDpi(value);
    setDpiInput(String(value));
  }, []);

  const refresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      const s = await fetchSettings();
      setConnected(true);
      setError(null);
      syncDpi(s.dpi_slots[s.active_dpi_slot]);
      setPollingRate(s.polling_rate);
      setBattery({ percent: s.battery_percent, charging: s.battery_charging });
      setDirty(false);
    } catch {
      setConnected(false);
      setBattery({ percent: 0, charging: false });
    } finally {
      refreshLock.current = false;
    }
  }, [syncDpi]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleApply = async () => {
    try {
      setError(null);
      const slots: [number, number, number, number, number] = [
        dpi,
        dpi,
        dpi,
        dpi,
        dpi,
      ];
      await applyDpi(slots, 0, 1);
      await applyPollingRate(pollingRate);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const commitDpiInput = () => {
    const num = parseInt(dpiInput, 10);
    if (isNaN(num)) {
      syncDpi(dpi);
      return;
    }
    const clamped = clampDpi(num);
    syncDpi(clamped);
    setDirty(true);
  };

  const handleDpiInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDpiInput(e.target.value);
  };

  const handleDpiInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitDpiInput();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleSliderChange = (v: number | readonly number[]) => {
    const val = Array.isArray(v) ? v[0] : v;
    syncDpi(val);
    setDirty(true);
  };

  return (
    <div className="flex h-screen flex-col select-none">
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 pb-3">
        {!connected && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <svg
              className="size-8 text-muted-foreground/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
              />
            </svg>
            <p className="text-sm font-medium">Mouse not detected</p>
            <p className="text-xs text-muted-foreground/50">
              Connect your Keychron G3 via USB
            </p>
          </div>
        )}

        {connected && (
          <>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  DPI
                </span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={dpiInput}
                  onChange={handleDpiInputChange}
                  onBlur={commitDpiInput}
                  onKeyDown={handleDpiInputKeyDown}
                  className="h-6 w-[72px] rounded-md border-0 bg-muted/60 px-2 text-center text-xs font-mono tabular-nums focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring/40"
                />
              </div>
              <Slider
                min={DPI_MIN}
                max={DPI_MAX}
                step={DPI_STEP}
                value={[dpi]}
                onValueChange={handleSliderChange}
              />
              <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground/35">
                <span>{DPI_MIN.toLocaleString()}</span>
                <span>{DPI_MAX.toLocaleString()}</span>
              </div>
            </div>

            <div className="h-px bg-border/50" />

            <div className="space-y-3">
              <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Polling Rate
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {POLLING_RATES.map((r) => (
                  <Button
                    key={r.code}
                    variant={pollingRate === r.code ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setPollingRate(r.code);
                      setDirty(true);
                    }}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-center text-xs text-destructive">{error}</p>
            )}

            <div className="flex-1" />

            <Button disabled={!dirty} onClick={handleApply} className="w-full">
              Apply Changes
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 text-[11px] text-muted-foreground/70">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block size-1.5 shrink-0 rounded-full ${
              connected
                ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]"
                : "bg-red-500"
            }`}
          />
          {connected ? "Connected" : "Disconnected"}
        </span>
        {connected && (
          <span className="flex items-center gap-3">
            <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
              <BatteryIcon percent={battery.percent} charging={battery.charging} />
              {battery.percent}%
            </Badge>
            <span className="font-mono text-[10px] opacity-40">0x3434</span>
          </span>
        )}
      </div>
    </div>
  );
}
