# Little Writer Desktop Companion — Linux / Wayland Adapter & Benchmarks

This repository documents running **Little Writer Desktop Companion** (Steam Demo) natively on Linux under Wayland (Hyprland), replacing the WinAPI keyboard hook with a zero-dependency Linux `evdev` implementation, and profiles the resource overhead of the Electron runtime.

---

## 📌 Background & Motivation

Under Windows, the game monitors global keystrokes across all applications using `SetWindowsHookExW`.

When running on Linux under Wayland via Steam Proton / Wine:
1. **Input Isolation:** Wayland's security design strictly isolates input between windows. XWayland only receives keyboard events when an XWayland window is actively focused. When typing in native Wayland applications (Firefox, terminal, editor, Telegram), Proton receives 0 events.
2. **Tiling Window Managers:** Tiling compositors (Hyprland, Sway, Niri) tile the frameless 400×400 companion across the whole screen unless specific floating rules are defined.
3. **Missing Linux Hook:** The game's native `keyboard-hook` addon only provides C++ implementations for Windows (`user32.lib`) and macOS (`ApplicationServices`). Linux was left unhandled.

Because the game is built with Electron/Node.js, it can be run **natively on Linux** without Wine/Proton, using direct `/dev/input` character device streaming.

---

## 📊 Resource Profiling & Benchmarks

Full process breakdown available in [BENCHMARKS.md](./BENCHMARKS.md).

* **Test Machine:** ThinkPad P15s Gen 2i, i7-1165G7, 48 GB RAM
* **OS / Compositor:** Omarchy 4.0 (Arch Linux), Hyprland 0.56.2 (Wayland)
* **Runtime:** Electron 43.6.0 (Chromium 134, Node v22.14.0)

### Key Metrics
* **Total Physical RAM (RSS):** `~782 MB`
* **Proportional Memory (PSS):** `~358 MB`
* **Total Spawned Processes:** `9 processes` (Main, Renderer, GPU, Network, Audio, Zygotes)
* **Window Size:** `400 × 400 px`

---

## 🛠️ Linux Implementation Details

### 1. Zero-Dependency Evdev Listener (`linux-keys.js`)
Instead of C++ compilation or WinAPI hooks, [linux-keys.js](./linux-keys.js) listens directly to Linux input event streams:
* Automatically detects active physical keyboards from `/dev/input/by-path/*-event-kbd` and `/proc/bus/input/devices`.
* Reads binary `input_event` packets (24 bytes on 64-bit Linux) via non-blocking asynchronous `fs.read`.
* Translates Linux evdev codes to standard PC scancodes expected by the game engine.
* Runs without `sudo` as long as the user belongs to the standard `input` group.

### 2. Active Window Detection via `hyprctl`
For the game's *"Only write when active in [App]"* feature, native Hyprland IPC is used:
```javascript
const out = await runProc("hyprctl", ["activewindow", "-j"]);
const activeClass = JSON.parse(out).class;
```

### 3. Hyprland Rules (`hyprland-rules.lua`)
See [hyprland-rules.lua](./hyprland-rules.lua) for keeping the companion floating, pinned across all workspaces, and fully opaque.

---

## 💡 Notes for the Game Developer

If you are the developer of *Little Writer Desktop Companion*, feel free to adopt `linux-keys.js` directly into your codebase to enable native Linux and Steam Deck support out of the box! No external native build dependencies or C++ recompilation required.

---

## 📄 License
MIT License. This repository contains only open-source adapter code and documentation; no proprietary game assets or art files are included.
