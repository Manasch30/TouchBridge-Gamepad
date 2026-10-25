"""
Windows DirectInput / Hardware Scan Code Input Injector
Designed for games (DirectInput, RawInput, Unreal Engine / eFootball)
Uses ctypes SendInput with KEYEVENTF_SCANCODE for hardware-level responsiveness.
"""

import ctypes
import time
import logging
from typing import Set, Dict

logger = logging.getLogger("InputInjector")

# Windows API constants
INPUT_KEYBOARD = 1
KEYEVENTF_KEYDOWN = 0x0000
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_SCANCODE = 0x0008

# C-compatible ctypes structures for SendInput
PUL = ctypes.POINTER(ctypes.c_ulong)

class KeyBdInput(ctypes.Structure):
    _fields_ = [
        ("wVk", ctypes.c_ushort),
        ("wScan", ctypes.c_ushort),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", PUL)
    ]

class HardwareInput(ctypes.Structure):
    _fields_ = [
        ("uMsg", ctypes.c_ulong),
        ("wParamL", ctypes.c_short),
        ("wParamH", ctypes.c_ushort)
    ]

class MouseInput(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_long),
        ("dy", ctypes.c_long),
        ("mouseData", ctypes.c_ulong),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", PUL)
    ]

class Input_I(ctypes.Union):
    _fields_ = [
        ("ki", KeyBdInput),
        ("mi", MouseInput),
        ("hi", HardwareInput)
    ]

class Input(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_ulong),
        ("ii", Input_I)
    ]

# Common DirectInput hardware scan codes
SCAN_CODES: Dict[str, int] = {
    "escape": 0x01, "esc": 0x01,
    "1": 0x02, "2": 0x03, "3": 0x04, "4": 0x05, "5": 0x06,
    "6": 0x07, "7": 0x08, "8": 0x09, "9": 0x0A, "0": 0x0B,
    "q": 0x10, "w": 0x11, "e": 0x12, "r": 0x13, "t": 0x14, "y": 0x15, "u": 0x16, "i": 0x17, "o": 0x18, "p": 0x19,
    "a": 0x1E, "s": 0x1F, "d": 0x20, "f": 0x21, "g": 0x22, "h": 0x23, "j": 0x24, "k": 0x25, "l": 0x26,
    "z": 0x2C, "x": 0x2D, "c": 0x2E, "v": 0x2F, "b": 0x30, "n": 0x31, "m": 0x32,
    "space": 0x39, "lshift": 0x2A, "rshift": 0x36, "shift": 0x2A,
    "lctrl": 0x1D, "rctrl": 0xE01D, "ctrl": 0x1D,
    "lalt": 0x38, "ralt": 0xE038, "alt": 0x38,
    "tab": 0x0F, "enter": 0x1C, "backspace": 0x0E,
    "up": 0xE048, "down": 0xE050, "left": 0xE04B, "right": 0xE04D,
    "f1": 0x3B, "f2": 0x3C, "f3": 0x3D, "f4": 0x3E,
    "f5": 0x3F, "f6": 0x40, "f7": 0x41, "f8": 0x42,
}

# eFootball default PC keyboard action mappings (customizable)
DEFAULT_ACTION_MAP: Dict[str, str] = {
    "test_button": "space",       # Safe key for Milestone Test C
    "pass": "s",                  # Short Pass
    "through": "w",               # Through Ball
    "shoot": "d",                 # Shoot / Clearance
    "def": "q",                   # DEF / RUN (Cursor Change / Pressing)
    "def_right": "e",             # Sprint / Dash [E]
    "def_left": "s",              # Match-Up Defense [S]
    "def_up": "d",                # Tackle / Clear [D]
    "def_down": "z",              # Physical Defending / Shoulder Barge [Z]
    "dash": "e",                  # Dash / Sprint (or lshift)
    "switch": "q",                # Cursor Change / Pressing
    "special": "c",               # Special Controls / Shield
    "move_up": "up",              # Directional navigation
    "move_down": "down",
    "move_left": "left",
    "move_right": "right",
    # WASD movement alternate
    "wasd_up": "w",
    "wasd_down": "s",
    "wasd_left": "a",
    "wasd_right": "d",
    # Gesture / Swipe Defaults (customizable)
    "pass_up": "w",               # Lofted Through / Chip Pass
    "pass_down": "s",             # Low driven pass
    "pass_left": "a",             # Long ball
    "pass_right": "e+s",          # Dash / Speed Pass
    "shoot_up": "w+d",            # Chip Shot
    "shoot_down": "c+d",          # Finesse / Controlled Shot
    "shoot_left": "a+d",          # Stunning Shot / Power Shot
    "shoot_right": "e+d",         # Dash Shot
    "through_up": "lshift+w",     # Lofted through ball
    "through_down": "s+w",        # Ground through ball
    "through_left": "a+w",        # Wide through ball
    "through_right": "e+w",       # Running through ball
    "cross": "q",                 # Legacy backward compat
    "cross_up": "d",
    "cross_down": "z",
    "cross_left": "s",
    "cross_right": "e",
}


class InputInjector:
    def __init__(self, action_map: Dict[str, str] = None, enable_injection: bool = True):
        self.action_map = action_map or DEFAULT_ACTION_MAP.copy()
        self.enable_injection = enable_injection
        self._held_keys: Set[str] = set()
        self._attach_input_desktop()

    def _attach_input_desktop(self):
        """Attaches current thread to the interactive Windows input desktop."""
        try:
            hdesk = ctypes.windll.user32.OpenInputDesktop(0, False, 0x01FF)
            if hdesk:
                ctypes.windll.user32.SetThreadDesktop(hdesk)
        except Exception as e:
            logger.debug(f"Input desktop attach notice: {e}")

    def set_key_state(self, key_name: str, is_pressed: bool) -> bool:
        """Injects a hardware scan code press or release."""
        key_name = key_name.lower()
        scan_code = SCAN_CODES.get(key_name)
        if scan_code is None:
            logger.warning(f"Unknown key: {key_name}")
            return False

        if not self.enable_injection:
            if is_pressed:
                self._held_keys.add(key_name)
                logger.info(f"[SIMULATED KEY DOWN] {key_name} (scan: 0x{scan_code:02X})")
            else:
                self._held_keys.discard(key_name)
                logger.info(f"[SIMULATED KEY UP] {key_name} (scan: 0x{scan_code:02X})")
            return True

        self._attach_input_desktop()

        flags = KEYEVENTF_SCANCODE
        if is_pressed:
            flags |= KEYEVENTF_KEYDOWN
            self._held_keys.add(key_name)
        else:
            flags |= KEYEVENTF_KEYUP
            self._held_keys.discard(key_name)

        # Extended key check (arrows, numpad enter, etc.)
        if scan_code > 0xFF:
            flags |= KEYEVENTF_EXTENDEDKEY
            actual_scan = scan_code & 0xFF
        else:
            actual_scan = scan_code

        extra = ctypes.c_ulong(0)
        ii_ = Input_I()
        ii_.ki = KeyBdInput(0, actual_scan, flags, 0, ctypes.pointer(extra))
        cmd = Input(INPUT_KEYBOARD, ii_)

        n = ctypes.windll.user32.SendInput(1, ctypes.pointer(cmd), ctypes.sizeof(cmd))
        if n != 1:
            err = ctypes.GetLastError()
            logger.error(f"SendInput failed for {key_name}: Windows error {err}")
            return False
        return True

    def handle_action(self, action: str, is_pressed: bool) -> bool:
        """Translates an eFootball action or custom key combo (e.g. 'lshift+s', 'c+d') to scan-code injection."""
        action_clean = action.lower().strip()
        target_key = self.action_map.get(action_clean)

        if not target_key:
            # Fallback: check if the action name is a direct key name or combination
            if action_clean in SCAN_CODES or "+" in action_clean:
                target_key = action_clean
            else:
                logger.warning(f"Unmapped action received: {action}")
                return False

        # Support multi-key combos (e.g. "lshift+d", "c+d", "w+a")
        if "+" in target_key:
            keys = [k.strip() for k in target_key.split("+") if k.strip()]
            success = True
            for k in keys:
                if not self.set_key_state(k, is_pressed):
                    success = False
            return success

        return self.set_key_state(target_key, is_pressed)

    def release_all(self):
        """Emergency release of all currently held keys to prevent stuck inputs."""
        if not self._held_keys:
            return
        keys_to_release = list(self._held_keys)
        logger.info(f"Releasing all held keys: {keys_to_release}")
        for k in keys_to_release:
            try:
                self.set_key_state(k, is_pressed=False)
            except Exception as e:
                logger.error(f"Error releasing key {k}: {e}")
        self._held_keys.clear()

    @property
    def held_keys(self) -> Set[str]:
        return set(self._held_keys)
