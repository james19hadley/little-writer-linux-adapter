-- Hyprland Window Rules for Little Writer Desktop Companion
-- Place inside ~/.config/hypr/hyprland.lua or your windowrules configuration:

-- When running via Native Electron:
o.window({ class = "typing-desktop-companion" }, {
  tag = "-default-opacity",
  float = true,
  pin = true,
  size = { 400, 400 },
  opacity = "1.0 override 1.0 override",
})

-- When running via Steam Proton:
o.window({ class = "steam_app_5236990" }, {
  tag = "-default-opacity",
  float = true,
  pin = true,
  size = { 400, 400 },
  opacity = "1.0 override 1.0 override",
})
