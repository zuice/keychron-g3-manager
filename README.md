# Keychron G3 Manager

A Linux desktop app for configuring the Keychron G3 (Ultra-Link 8K) gaming mouse. Built with Tauri, React, and shadcn/ui.

Supports both USB wired (PID 0xD06E) and wireless dongle (PID 0xD028) connections.

## Features

- DPI adjustment (100–26000) with slider and numeric input
- Polling rate control (125/500/1000/2000/4000/8000 Hz)
- Battery level and charging status
- Auto-reconnect on device plug/unplug

## Requirements

- Linux with hidraw support
- Rust, Node.js/bun
- WebKitGTK (for Tauri)

## Building

```bash
bun install
bun run tauri build --bundles deb
```

The binary ends up at `src-tauri/target/release/keychron-g3-manager`.

### Wayland (Hyprland etc.)

Run with:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 GDK_BACKEND=x11 keychron-g3-manager
```

## Installing

```bash
cp src-tauri/target/release/keychron-g3-manager ~/.local/bin/
```

A `.desktop` file can be placed at `~/.local/share/applications/keychron-g3-manager.desktop` for app launcher integration.

## Permissions

The hidraw device (`/dev/hidrawN`) must be readable/writable. If yours isn't `crw-rw-rw-`, add a udev rule:

```
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3434", MODE="0666"
```

## Tech Stack

- **Backend**: Rust + hidapi (raw USB HID protocol)
- **Frontend**: React 19 + shadcn/ui + Tailwind CSS
- **Framework**: Tauri v2

## License

MIT
