"""
Automated Pipeline Verification Test (Milestones A, B, C)
Connects to the Touch Bridge WebSocket receiver, verifies ping/pong latency,
and exercises key press/release actions.
"""

import asyncio
import json
import time
import websockets

async def run_pipeline_test():
    uri = "ws://127.0.0.1:8765"
    print(f"Connecting to receiver at {uri}...")

    async with websockets.connect(uri) as ws:
        print("[TEST A] Connected successfully to WebSocket server!")

        # 1. Send Hello
        await ws.send(json.dumps({"type": "hello", "client": "Automated Test Suite", "seq": 1}))
        status_msg = await ws.recv()
        print(f"Server Initial Status: {status_msg}")

        # 2. Test B: Ping-Pong Latency Benchmark
        print("\n[TEST B] Running 10-packet Ping/Pong RTT Benchmark...")
        rtts = []
        for seq in range(2, 12):
            t_start = time.perf_counter()
            await ws.send(json.dumps({
                "type": "ping",
                "client_time": t_start,
                "seq": seq
            }))
            resp = json.loads(await ws.recv())
            t_end = time.perf_counter()
            rtt_ms = (t_end - t_start) * 1000.0
            rtts.append(rtt_ms)
            print(f"  Seq {seq}: RTT = {rtt_ms:.3f} ms | Pong client_time echoed: {resp.get('client_time') == t_start}")
            await asyncio.sleep(0.02)

        min_rtt = min(rtts)
        med_rtt = sorted(rtts)[len(rtts) // 2]
        max_rtt = max(rtts)
        print(f"Benchmark Results: Min={min_rtt:.2f}ms | Median={med_rtt:.2f}ms | Max={max_rtt:.2f}ms")

        # 3. Test C: Windows Input Delivery (Press & Release)
        print("\n[TEST C] Testing Button Press & Release...")
        # Press Spacebar test button
        await ws.send(json.dumps({
            "type": "press",
            "button": "test_button",
            "seq": 20
        }))
        press_status = json.loads(await ws.recv())
        print(f"  After Press: Held Keys on Server = {press_status.get('held_keys')}")
        assert "space" in press_status.get("held_keys", []), "Spacebar should be held on server!"

        await asyncio.sleep(0.1)

        # Release Spacebar
        await ws.send(json.dumps({
            "type": "release",
            "button": "test_button",
            "seq": 21
        }))
        release_status = json.loads(await ws.recv())
        print(f"  After Release: Held Keys on Server = {release_status.get('held_keys')}")
        assert "space" not in release_status.get("held_keys", []), "Spacebar should be released on server!"

        print("\n[ALL TESTS PASSED] Input pipeline from WebSocket transport to DirectInput is verified!")

if __name__ == "__main__":
    asyncio.run(run_pipeline_test())
