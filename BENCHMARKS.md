# Benchmark & Resource Profiling: Little Writer Desktop Companion (Linux Port)

**Target System Hardware & Software:**
* **Host Machine:** Lenovo ThinkPad P15s Gen 2i (`20W600J9GE`)
* **CPU:** 11th Gen Intel(R) Core(TM) i7-1165G7 (8 threads @ 4.70 GHz)
* **GPU:** Intel Iris Xe Graphics + NVIDIA Quadro T500 Mobile
* **Display:** 1920×1080 @ 1.25× fractional scaling, 60 Hz
* **Total System RAM:** 48 GB DDR4 (46.77 GiB usable)
* **OS Distribution:** Omarchy 4.0.0 (Arch Linux base, Rolling)
* **Kernel:** Linux `7.2.3-arch1-3` (x86_64)
* **Compositor / Window Manager:** Hyprland `0.56.2` (Native Wayland)
* **Electron Runtime:** `electron43` (v43.6.0, Chromium 134, Node v22.14.0)

---

## 1. Physical Memory Profile (Active Idle Companion)

Measurements taken directly from `/proc/[pid]/smaps_rollup` during normal active typing session (word count tracking enabled):

| PID | Component / Process Type | RSS (Resident) | PSS (Proportional) | USS (Private Unique) | Memory Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `84703` | **Electron Main Process** | **196.2 MB** | 102.0 MB | 72.3 MB | Node.js runtime, window state, IPC |
| `84754` | **Chromium Renderer** | **173.5 MB** | 115.5 MB | 87.8 MB | HTML5 Canvas, sprite engine, V8 heap |
| `84746` | **GPU Process** | **159.4 MB** | 65.4 MB | 45.4 MB | Wayland EGL/GLES context & buffers |
| `84749` | **Network Service** | **66.4 MB** | 22.6 MB | 13.8 MB | Chromium Mojom IPC Network worker |
| `84853` | **Audio Service** | **57.8 MB** | 18.1 MB | 11.7 MB | Chromium Mojom WebAudio worker |
| `84712` | **Zygote Sandbox** | **49.7 MB** | 10.5 MB | 1.0 MB | Linux namespace sandbox template |
| `84713` | **Zygote Sandbox** | **48.9 MB** | 8.2 MB | 0.2 MB | Sandboxed helper fork |
| `89632` | **GPU Sub-helper** | **15.2 MB** | 12.1 MB | 12.1 MB | Wayland raster worker |
| `84715` | **Zygote (PID Namespace)** | **14.9 MB** | 4.3 MB | 0.3 MB | Security sandbox process |
| **TOTAL** | **9 Active Processes** | **782.17 MB** | **358.70 MB** | **244.53 MB** | Physical RAM allocation |

---

## 2. Resource Impact Analysis

### Why Electron Is Inefficient for Desktop Companions
1. **Multi-process Sandboxing Overhead:** Chromium's security architecture mandates separate OS processes for GPU, rendering, networking, and audio. Even with an offline 400×400 canvas game, 9 individual processes are spawned.
2. **V8 Heap Baseline:** Every Chromium renderer initializes a baseline JavaScript virtual machine heap and DOM bindings requiring ~80–120 MB before running game scripts.
3. **Hardware Acceleration Footprint:** Wayland EGL buffer allocation reserves ~160 MB of RAM for the GPU process even for simple 1-bit monochrome pixel animations.

---

## 3. Projected Savings with Native Rust Architecture

```
+--------------------------------------------------------------------------+
|                       DESKTOP OVERLAY RESOURCE TARGET                     |
+-----------------------------------+--------------------------------------+
| Electron Port (Current)           | Native Rust / Layer-Shell (Target)   |
+-----------------------------------+--------------------------------------+
| Total RAM (RSS): 782 MB           | Total RAM (RSS): 15 - 25 MB          |
| Active Processes: 9               | Active Processes: 1 single binary    |
| Package Size: ~120 MB             | Package Size: ~10 - 15 MB            |
| Cold Startup Time: ~1.8s          | Cold Startup Time: < 0.05s           |
| Wayland Protocol: XDG Toplevel    | Wayland Protocol: wlr-layer-shell    |
| (requires custom WM tiling rules) | (native compositor desktop surface)  |
+-----------------------------------+--------------------------------------+
```
