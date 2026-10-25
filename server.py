"""
eFootball Touch Bridge - Windows Receiver & Web Server
Provides:
  1. HTTP Server (Port 8080): Serves the touch interface to the Android phone.
  2. WebSocket Server (Port 8765): Low-latency bidirectional input & benchmark pipeline.
  3. DirectInput Hardware Scan-Code Injection for eFootball PC.
  4. Terminal QR Code display for quick phone camera pairing.
"""

import asyncio
import io
import json
import logging
import os
import socket
import sys
import threading
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from typing import Set

import qrcode
import websockets

from input_injector import InputInjector

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("TouchBridgeServer")

# Server Configuration
HTTP_PORT = 8080
WS_PORT = 8765
WEB_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


def get_local_ip() -> str:
    """Detects the primary LAN IPv4 address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    """Custom HTTP handler serving web assets without caching for seamless mobile development."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, format, *args):
        # Silence verbose GET requests to keep console clean
        pass


def run_http_server(host: str, port: int):
    """Runs the HTTP file server in a dedicated thread."""
    server = HTTPServer((host, port), NoCacheHTTPRequestHandler)
    server.serve_forever()


class TouchBridgeServer:
    def __init__(self):
        self.injector = InputInjector(enable_injection=True)
        self.active_clients: Set = set()
        
        # State for joystick directional keys
        self.current_direction_keys: Set[str] = set()

    async def broadcast_status(self):
        """Sends current receiver status and held keys to all connected clients."""
        if not self.active_clients:
            return
        payload = json.dumps({
            "type": "status_update",
            "held_keys": list(self.injector.held_keys),
            "client_count": len(self.active_clients)
        })
        websockets_to_remove = set()
        for ws in self.active_clients:
            try:
                await ws.send(payload)
            except Exception:
                websockets_to_remove.add(ws)
        self.active_clients.difference_update(websockets_to_remove)

    def handle_joystick_move(self, x: float, y: float):
        """
        Translates analog normalized joystick coordinates (-1.0 to 1.0)
        into 8-way directional keyboard actions (move_up, move_down, move_left, move_right).
        """
        new_direction_keys: Set[str] = set()

        deadzone = 0.20
        if y < -deadzone:
            new_direction_keys.add("move_up")
        elif y > deadzone:
            new_direction_keys.add("move_down")

        if x < -deadzone:
            new_direction_keys.add("move_left")
        elif x > deadzone:
            new_direction_keys.add("move_right")

        # Keys that were released
        keys_to_release = self.current_direction_keys - new_direction_keys
        for k in keys_to_release:
            self.injector.handle_action(k, is_pressed=False)

        # Keys that were newly pressed
        keys_to_press = new_direction_keys - self.current_direction_keys
        for k in keys_to_press:
            self.injector.handle_action(k, is_pressed=True)

        self.current_direction_keys = new_direction_keys

    async def handle_client(self, websocket):
        """Handles an individual WebSocket client connection."""
        client_address = websocket.remote_address
        self.active_clients.add(websocket)
        logger.info(f"[+] Client connected from {client_address[0]}:{client_address[1]}")

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                except json.JSONDecodeError:
                    continue

                msg_type = data.get("type")

                # TEST B: High-Precision Ping/Pong Timing Benchmark
                if msg_type == "ping":
                    pong_msg = {
                        "type": "pong",
                        "client_time": data.get("client_time", 0),
                        "server_time": time.time(),
                        "seq": data.get("seq", 0)
                    }
                    await websocket.send(json.dumps(pong_msg))

                # TEST A: Diagnostic Echo
                elif msg_type == "echo":
                    logger.info(f"[*] Probe received: '{data.get('message')}' from {client_address[0]}")
                    reply = {
                        "type": "echo_reply",
                        "message": f"Server received: {data.get('message')}",
                        "timestamp": time.time()
                    }
                    await websocket.send(json.dumps(reply))

                # TEST C / HUD: Button Press
                elif msg_type == "press":
                    button = data.get("combo") or data.get("button", "")
                    if button:
                        self.injector.handle_action(button, is_pressed=True)
                        await self.broadcast_status()

                # TEST C / HUD: Button Release
                elif msg_type == "release":
                    button = data.get("combo") or data.get("button", "")
                    if button:
                        self.injector.handle_action(button, is_pressed=False)
                        await self.broadcast_status()

                elif msg_type == "update_mappings":
                    mappings = data.get("mappings", {})
                    if isinstance(mappings, dict):
                        self.injector.action_map.update(mappings)
                        logger.info(f"Updated dynamic action mappings: {len(mappings)} entries")

                # HUD: Analog Joystick Move
                elif msg_type == "move":
                    x = float(data.get("x", 0.0))
                    y = float(data.get("y", 0.0))
                    self.handle_joystick_move(x, y)

                # Client Hello / Configuration
                elif msg_type == "hello":
                    logger.info(f"Client identified: {data.get('client')}")
                    await self.broadcast_status()

                elif msg_type == "config":
                    if "enable_injection" in data:
                        self.injector.enable_injection = bool(data["enable_injection"])
                        mode = "HARDWARE SCAN CODE" if self.injector.enable_injection else "DIAGNOSTIC SIMULATION"
                        logger.info(f"Injection mode set to: {mode}")

        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f"[-] Client {client_address[0]} closed connection ({e.code})")
        except Exception as e:
            logger.error(f"[!] Exception in client loop: {e}")
        finally:
            self.active_clients.discard(websocket)
            logger.info(f"[-] Client {client_address[0]} disconnected. Releasing all held keys.")
            
            # CRITICAL SAFETY REQUIREMENT: Release all held keys when client drops!
            self.current_direction_keys.clear()
            self.injector.release_all()
            await self.broadcast_status()


def print_banner(local_ip: str):
    """Prints a beautiful console banner with clickable URL and terminal QR code."""
    url = f"http://{local_ip}:{HTTP_PORT}"
    ws_url = f"ws://{local_ip}:{WS_PORT}"

    print("\n" + "=" * 65)
    print("      [+] eFootball Touch Bridge - Low-Latency Controller [+]")
    print("=" * 65)
    print(f"\n  [1] Touch Controller Web UI:  {url}")
    print(f"  [2] WebSocket Receiver Port:   {ws_url}")
    print(f"  [3] Status:                    ACTIVE & LISTENING")
    print(f"  [4] Default Safe Test Key:     [SPACEBAR]")
    print(f"  [5] Mapped eFootball Keys:     Pass=[S], Shoot=[D], Through=[W],")
    print(f"                                 Cross=[A], Dash=[E], Switch=[Q]")
    print("\n" + "-" * 65)
    print("  Scan this QR Code with your Android Phone Camera to open:")
    print("-" * 65 + "\n")

    # Generate ASCII QR Code
    try:
        qr = qrcode.QRCode(border=1)
        qr.add_data(url)
        qr.make(fit=True)
        f = io.StringIO()
        qr.print_ascii(out=f, invert=True)
        print(f.getvalue())
    except Exception as e:
        logger.warning(f"Could not render ASCII QR code: {e}")

    print("-" * 65)
    print("  TIP: Keep your phone and PC on the same Wi-Fi network.")
    print("  Press Ctrl+C to stop the receiver safely at any time.")
    print("=" * 65 + "\n")


async def main():
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
    local_ip = get_local_ip()

    # 1. Start HTTP Static File Server in background thread
    http_thread = threading.Thread(
        target=run_http_server,
        args=("0.0.0.0", HTTP_PORT),
        daemon=True
    )
    http_thread.start()

    # 2. Print Startup Banner & QR Code
    print_banner(local_ip)

    # 3. Start WebSocket Server
    server = TouchBridgeServer()
    async with websockets.serve(server.handle_client, "0.0.0.0", WS_PORT):
        # Keep server running until cancelled
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n[!] Touch Bridge Server stopped cleanly by user.")
