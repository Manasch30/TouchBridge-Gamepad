# 🎮 TouchBridge Gamepad
> **Turn any smartphone or tablet into an ultra-low-latency, customizable PC touch gamepad over Wi-Fi.**  
> Zero app installation required — runs directly in your mobile browser with hardware-level DirectInput scan-code injection.

---

## ⚡ Highlights

- **🚀 Sub-Millisecond Precision**: High-frequency bidirectional WebSocket pipeline with built-in RTT latency diagnostics and sliding-window jitter monitors.
- **🎯 DirectInput Hardware Injection**: Direct `SendInput` keyboard scan codes via Windows `user32.dll` — recognized natively by games (eFootball, EA Sports FC / FIFA, fighting games, racing games, etc.) without requiring third-party virtual drivers.
- **🕹️ Dynamic Floating Joystick**: Deadzone filtering, visual angle HUD, and directional throttling for smooth 360-degree analog-style movement.
- **✨ 4-Way Swipe Flick Gestures**: Flick Up, Down, Left, or Right on action buttons to trigger complex multi-key combinations (e.g. `w+d`, `c+d`, `lshift+w`) with an intelligent buffer timer that prevents premature tap firing.
- **📐 In-Game HUD Layout Editor**: Drag, reposition, scale (55%–180%), adjust opacity, or create custom buttons live from your phone screen.
- **💾 Game Profile Manager**: Create, switch, export (`.json`), and import complete controller profiles for different PC games.
- **📱 PWA & Fullscreen Ready**: Installable to Android / iOS home screen with Screen Wake Lock and audio/vibration tactile haptic feedback.

---

## 📋 System Requirements

- **PC**: Windows 10 or 11
- **Python**: 3.9+
- **Phone / Tablet**: Any device with a modern mobile browser (Chrome, Safari, Firefox, Edge) connected to the same Wi-Fi network as the PC.

---

## 🚀 Quick Start Guide

### 1. Clone the Repository
```bash
git clone https://github.com/Manasch30/TouchBridge-Gamepad.git
cd TouchBridge-Gamepad
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Launch the Server
Double-click `start_controller.bat` **or** run via terminal:
```bash
python server.py
```

### 4. Connect Your Phone
- A **QR Code** and local network URL (`http://<PC-LAN-IP>:8080`) will display in your PC terminal.
- Scan the QR code or open the link on your phone's browser.
- Tap **"CONTROLLER"** and start playing!

---

## 🎮 Built-In Game Profiles

| Profile | Target Games | Configured Controls |
| :--- | :--- | :--- |
| **eFootball (Mobile Layout)** | eFootball 2024 / 2025 PC | Through `[W]`, Pass/Match-up `[S]`, Shoot `[D]`, Def/Run `[Q]`, Dash `[E]` + 4-way chip/finesse/stunning swipe gestures |
| **FIFA / EA Sports FC** | EA FC 24, FIFA 23/22 | Through `[W]`, Short Pass `[S]`, Shoot `[D]`, Sprint/Tackle `[E]`, Cross `[A]` |
| **Custom Profiles** | Any PC Game | Add as many buttons and custom key combinations as you want |

---

## 🛠️ Architecture

```
┌─────────────────────────────────┐           WebSocket (Port 8765)           ┌─────────────────────────────────┐
│     Mobile Phone / Browser      │ ◄───────────────────────────────────────► │       Python Server & Host      │
│  - HTML5 Canvas & Touch Events  │            Binary / JSON                  │  - HTTP Server (Port 8080)      │
│  - Dynamic Floating Joystick    │                                           │  - Latency Benchmark Engine     │
│  - Swipe Combo Recognition      │                                           │  - Windows SendInput / ctypes   │
│  - LocalStorage & Profiles      │                                           │  - DirectInput Scan Code Mapper │
└─────────────────────────────────┘                                           └────────────────┬────────────────┘
                                                                                               │
                                                                                    DirectInput Hardware Events
                                                                                               ▼
                                                                              ┌─────────────────────────────────┐
                                                                              │       PC Game (eFootball)       │
                                                                              └─────────────────────────────────┘
```

---

## 🔒 Privacy & Safety
- **100% Local**: All communication stays strictly inside your local Wi-Fi network. No telemetry, no external cloud dependencies.
- **Clean Disconnect Failsafe**: All active keys are automatically released instantly if your phone disconnects or goes to sleep.

---

## 📜 License
MIT License. Free to use, modify, and distribute.
