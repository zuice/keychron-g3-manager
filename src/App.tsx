import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchSettings,
  applyDpi,
  applyPollingRate,
  fetchProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  setActiveProfileId as apiSetActiveProfileId,
  fetchActiveProfileId,
  POLLING_RATES,
  DPI_MIN,
  DPI_MAX,
  DPI_STEP,
  type Profile,
} from "./api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { BatteryCharging, BatteryFull, BatteryMedium, BatteryLow, Plus, X, Pencil } from "lucide-react";

function BatteryIcon({ percent, charging }: { percent: number; charging: boolean }) {
  const props = { className: "size-3.5" };
  if (charging) return <BatteryCharging {...props} />;
  if (percent > 75) return <BatteryFull {...props} />;
  if (percent > 25) return <BatteryMedium {...props} />;
  return <BatteryLow {...props} />;
}

function clampDpi(n: number) {
  return Math.max(DPI_MIN, Math.min(DPI_MAX, Math.round(n / DPI_STEP) * DPI_STEP));
}

export default function App() {
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number>(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newName, setNewName] = useState("");

  const [dpi, setDpi] = useState(1600);
  const [dpiInput, setDpiInput] = useState("1600");
  const [pollingRate, setPollingRate] = useState(2);

  const [battery, setBattery] = useState<{ percent: number; charging: boolean }>({
    percent: 0,
    charging: false,
  });

  const refreshLock = useRef(false);
  const syncingRef = useRef(false);

  const syncDpi = useCallback((value: number) => {
    setDpi(value);
    setDpiInput(String(value));
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const [p, activeId] = await Promise.all([fetchProfiles(), fetchActiveProfileId()]);
      setProfiles(p);
      setActiveProfileId(activeId);
      const active = p.find((pr) => pr.id === activeId);
      if (active) {
        syncDpi(active.dpi);
        setPollingRate(active.polling_rate);
      }
    } catch {}
  }, [syncDpi]);

  const refresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      const s = await fetchSettings();
      setConnected(true);
      setError(null);
      setBattery({ percent: s.battery_percent, charging: s.battery_charging });
    } catch {
      setConnected(false);
      setBattery({ percent: 0, charging: false });
    } finally {
      refreshLock.current = false;
    }
  }, []);

  useEffect(() => {
    loadProfiles();
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [loadProfiles, refresh]);

  const applyProfileToDevice = useCallback(
    (dpi: number, pollingRate: number) => {
      syncingRef.current = true;
      applyDpi([dpi, dpi, dpi, dpi, dpi], 0, 1)
        .then(() => applyPollingRate(pollingRate))
        .catch((e) => setError(String(e)))
        .finally(() => {
          syncingRef.current = false;
        });
    },
    [],
  );

  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  useEffect(() => {
    if (!connected) return;
    const active = profilesRef.current.find((p) => p.id === activeProfileId);
    if (!active) return;
    applyProfileToDevice(active.dpi, active.polling_rate);
  }, [connected, activeProfileId, applyProfileToDevice]);

  const handleDpiSlide = useCallback(
    (value: number) => {
      const clamped = clampDpi(value);
      setDpi(clamped);
      setDpiInput(String(clamped));
      setProfiles((prev) =>
        prev.map((p) => (p.id === activeProfileId ? { ...p, dpi: clamped } : p)),
      );
    },
    [activeProfileId],
  );

  const handleDpiCommit = useCallback(
    async (value: number) => {
      const clamped = clampDpi(value);
      updateProfile(activeProfileId, undefined, clamped, undefined).catch(() => {});
      applyDpi([clamped, clamped, clamped, clamped, clamped], 0, 1).catch(() => {});
    },
    [activeProfileId],
  );

  const handlePollingChange = useCallback(
    async (code: number) => {
      setPollingRate(code);
      updateProfile(activeProfileId, undefined, undefined, code).catch(() => {});
      applyPollingRate(code).catch(() => {});
      setProfiles((prev) =>
        prev.map((p) => (p.id === activeProfileId ? { ...p, polling_rate: code } : p)),
      );
    },
    [activeProfileId],
  );

  const commitDpiInput = () => {
    const num = parseInt(dpiInput, 10);
    if (isNaN(num)) {
      syncDpi(dpi);
      return;
    }
    const clamped = clampDpi(num);
    syncDpi(clamped);
    setProfiles((prev) =>
      prev.map((p) => (p.id === activeProfileId ? { ...p, dpi: clamped } : p)),
    );
    handleDpiCommit(clamped);
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

  const switchProfile = async (id: number) => {
    setActiveProfileId(id);
    await apiSetActiveProfileId(id);
    const target = profiles.find((p) => p.id === id);
    if (target) {
      syncDpi(target.dpi);
      setPollingRate(target.polling_rate);
    }
  };

  const handleCreateProfile = async () => {
    if (!newName.trim()) return;
    try {
      const p = await createProfile(newName.trim());
      setProfiles((prev) => [...prev, p]);
      setShowNewProfile(false);
      setNewName("");
      await switchProfile(p.id);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteProfile = async (id: number) => {
    try {
      await deleteProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (activeProfileId === id) {
        const def = profiles.find((p) => p.is_default);
        if (def) await switchProfile(def.id);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const startEditing = (p: Profile) => {
    setEditingId(p.id);
    setEditName(p.name);
  };

  const commitEdit = async () => {
    if (editingId && editName.trim()) {
      try {
        await updateProfile(editingId, editName.trim());
        setProfiles((prev) =>
          prev.map((p) => (p.id === editingId ? { ...p, name: editName.trim() } : p)),
        );
      } catch (e) {
        setError(String(e));
      }
    }
    setEditingId(null);
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  return (
    <div className="flex h-screen flex-col select-none">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pb-3">
        {connected && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {profiles.map((p) => (
                <div key={p.id} className="group relative flex shrink-0 items-center">
                  {editingId === p.id ? (
                    <Input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                      className="h-6 w-20 rounded-md border-0 bg-muted/60 px-2 text-xs focus-visible:ring-1 focus-visible:ring-ring/40"
                    />
                  ) : (
                    <Button
                      variant={activeProfileId === p.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => switchProfile(p.id)}
                      className="h-6 gap-1 px-2 text-xs"
                    >
                      {p.name}
                    </Button>
                  )}
                  {!p.is_default && activeProfileId === p.id && editingId !== p.id && (
                    <span className="absolute -right-1 -top-1 hidden items-center gap-0.5 group-hover:flex">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(p);
                        }}
                        className="flex size-3.5 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="size-2" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(p.id);
                        }}
                        className="flex size-3.5 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {showNewProfile ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateProfile();
                      if (e.key === "Escape") {
                        setShowNewProfile(false);
                        setNewName("");
                      }
                    }}
                    onBlur={() => {
                      if (!newName.trim()) {
                        setShowNewProfile(false);
                        setNewName("");
                      }
                    }}
                    placeholder="Name"
                    className="h-6 w-20 rounded-md border-0 bg-muted/60 px-2 text-xs focus-visible:ring-1 focus-visible:ring-ring/40"
                  />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowNewProfile(true)}
                  className="shrink-0"
                >
                  <Plus className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        )}

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

        {connected && activeProfile && (
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
                onValueChange={(v) => handleDpiSlide(Array.isArray(v) ? v[0] : v)}
                onValueCommitted={(v) => handleDpiCommit(Array.isArray(v) ? v[0] : v)}
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
                    onClick={() => handlePollingChange(r.code)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>

            {error && <p className="text-center text-xs text-destructive">{error}</p>}
          </>
        )}

        <div className="flex-1" />
      </div>

      <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 text-[11px] text-muted-foreground/70">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block size-1.5 shrink-0 rounded-full ${
              connected ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" : "bg-red-500"
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
