const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");

const EVENT_KEY_PRESSED = 4;
const EVENT_KEY_RELEASED = 5;
const EV_KEY = 1;
const EVENT_SIZE = 24;

// Scancode mappings from Linux evdev keycodes to libuiohook / game scancodes
// Keycodes 1-88 in Linux evdev map 1:1 to PC standard scancodes (Set 1).
const EVDEV_TO_SCANCODE = {
  // Arrow keys
  103: 57416, // KEY_UP    -> 0xE048
  105: 57419, // KEY_LEFT  -> 0xE04B
  106: 57421, // KEY_RIGHT -> 0xE04D
  108: 57424, // KEY_DOWN  -> 0xE050

  // Navigation cluster
  102: 57415, // KEY_HOME     -> 0xE047
  104: 57417, // KEY_PAGEUP   -> 0xE049
  107: 57423, // KEY_END      -> 0xE04F
  109: 57425, // KEY_PAGEDOWN -> 0xE051
  110: 57426, // KEY_INSERT   -> 0xE052
  111: 57427, // KEY_DELETE   -> 0xE053

  // Modifiers
  97: 57373,  // KEY_RIGHTCTRL -> 0xE01D
  100: 57400, // KEY_RIGHTALT  -> 0xE038
  125: 57435, // KEY_LEFTMETA  -> 0xE05B
  126: 57436, // KEY_RIGHTMETA -> 0xE05C
};

const IGNORED_NAMES = [
  "sleep button",
  "power button",
  "video bus",
  "pc speaker",
  "lid switch",
  "intel hid events",
];

function getKeyboardDevices() {
  const devices = new Set();

  // 1. Check by-path symlinks (reliable for physical keyboards)
  try {
    const byPathDir = "/dev/input/by-path";
    if (fs.existsSync(byPathDir)) {
      const entries = fs.readdirSync(byPathDir);
      for (const entry of entries) {
        if (entry.includes("-event-kbd")) {
          const fullPath = path.join(byPathDir, entry);
          const real = fs.realpathSync(fullPath);
          if (fs.existsSync(real)) {
            devices.add(real);
          }
        }
      }
    }
  } catch (_) {}

  // 2. Check /proc/bus/input/devices for virtual or USB keyboards
  try {
    const data = fs.readFileSync("/proc/bus/input/devices", "utf8");
    const blocks = data.split("\n\n");
    for (const block of blocks) {
      const nameMatch = block.match(/N:\s*Name="([^"]+)"/i);
      const name = (nameMatch ? nameMatch[1] : "").toLowerCase();

      if (IGNORED_NAMES.some((ign) => name.includes(ign))) {
        continue;
      }

      if (/H:\s*Handlers=.*kbd/i.test(block) && /H:\s*Handlers=.*(event\d+)/i.test(block)) {
        const match = block.match(/H:\s*Handlers=.*?(event\d+)/i);
        if (match) {
          const dev = `/dev/input/${match[1]}`;
          if (fs.existsSync(dev)) {
            devices.add(dev);
          }
        }
      }
    }
  } catch (err) {
    console.error("[linux-keys] Error reading /proc/bus/input/devices:", err.message);
  }

  // 3. Fallback: check event3
  if (fs.existsSync("/dev/input/event3")) {
    devices.add("/dev/input/event3");
  }

  return Array.from(devices);
}

class LinuxKeyboardHook extends EventEmitter {
  constructor() {
    super();
    this._started = false;
    this._handles = new Map();
    this._watcher = null;
    this._shiftPressed = false;
    this._ctrlPressed = false;
    this._altPressed = false;
    this._metaPressed = false;
  }

  start() {
    if (this._started) return;
    this._started = true;

    const devs = getKeyboardDevices();
    for (const dev of devs) {
      this._openDevice(dev);
    }

    try {
      this._watcher = fs.watch("/dev/input", (eventType, filename) => {
        if (!filename || !filename.startsWith("event")) return;
        setTimeout(() => {
          if (!this._started) return;
          const currentDevs = getKeyboardDevices();
          for (const d of currentDevs) {
            if (!this._handles.has(d)) {
              this._openDevice(d);
            }
          }
        }, 1000);
      });
    } catch (_) {}
  }

  _openDevice(devPath) {
    if (this._handles.has(devPath)) return;

    let fd;
    try {
      fd = fs.openSync(devPath, "r");
    } catch (err) {
      return;
    }

    const state = { fd, active: true };
    this._handles.set(devPath, state);

    const buf = Buffer.alloc(EVENT_SIZE * 32);
    let leftover = Buffer.alloc(0);

    const readNext = () => {
      if (!this._started || !state.active) return;

      fs.read(fd, buf, 0, buf.length, null, (err, bytesRead) => {
        if (err) {
          this._closeDevice(devPath);
          return;
        }

        if (bytesRead > 0) {
          const combined = leftover.length > 0
            ? Buffer.concat([leftover, buf.slice(0, bytesRead)])
            : buf.slice(0, bytesRead);

          let offset = 0;
          while (offset + EVENT_SIZE <= combined.length) {
            const type = combined.readUInt16LE(offset + 16);
            const code = combined.readUInt16LE(offset + 18);
            const value = combined.readInt32LE(offset + 20);

            if (type === EV_KEY) {
              this._handleKeyEvent(code, value);
            }
            offset += EVENT_SIZE;
          }

          leftover = combined.slice(offset);
        }

        if (this._started && state.active) {
          readNext();
        }
      });
    };

    readNext();
  }

  _handleKeyEvent(evdevCode, value) {
    const isDown = value === 1 || value === 2;
    if (evdevCode === 42 || evdevCode === 54) this._shiftPressed = isDown;
    if (evdevCode === 29 || evdevCode === 97) this._ctrlPressed = isDown;
    if (evdevCode === 56 || evdevCode === 100) this._altPressed = isDown;
    if (evdevCode === 125 || evdevCode === 126) this._metaPressed = isDown;

    const keycode = EVDEV_TO_SCANCODE[evdevCode] !== undefined
      ? EVDEV_TO_SCANCODE[evdevCode]
      : evdevCode;

    const event = {
      keycode,
      shiftKey: this._shiftPressed,
      ctrlKey: this._ctrlPressed,
      altKey: this._altPressed,
      metaKey: this._metaPressed,
    };

    if (value === 1) {
      event.type = EVENT_KEY_PRESSED;
      this.emit("keydown", event);
    } else if (value === 0) {
      event.type = EVENT_KEY_RELEASED;
      this.emit("keyup", event);
    }
  }

  _closeDevice(devPath) {
    const state = this._handles.get(devPath);
    if (state) {
      state.active = false;
      try { fs.closeSync(state.fd); } catch (_) {}
      this._handles.delete(devPath);
    }
  }

  stop() {
    if (!this._started) return;
    this._started = false;

    if (this._watcher) {
      try { this._watcher.close(); } catch (_) {}
      this._watcher = null;
    }

    for (const devPath of Array.from(this._handles.keys())) {
      this._closeDevice(devPath);
    }
    this._handles.clear();
  }
}

module.exports = { LinuxKeyboardHook };
