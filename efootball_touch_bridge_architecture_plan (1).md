# eFootball Touch Bridge --- Architecture & Validation Plan

**Status:** Scope and architecture proposal only\
**Implementation status:** Not yet tested end-to-end\
**Goal:** Use an Android phone as a responsive touch controller for
eFootball running on a Windows PC.

## 1. Core decision

Start with the simplest prototype that can prove the input pipeline. Do
**not** build the complete controller UI or commit to a native Android
app until latency and input delivery have been measured.

### Proposed initial architecture

1.  **Android phone:** a lightweight browser-based touch interface.
2.  **Local network:** phone and PC communicate over the same Wi-Fi/LAN.
3.  **Transport:** one persistent WebSocket connection for low-overhead,
    two-way messaging.
4.  **Windows receiver:** a small Python process receives events.
5.  **Input adapter:** initially test keyboard injection; separately
    investigate a virtual gamepad if supported and appropriate for the
    game.

This is a proposal, not a verified working implementation. Actual
eFootball compatibility and input mappings remain unconfirmed.

## 2. Is WebSocket too expensive?

Usually not for this use case. WebSocket keeps a connection open, so the
app does not need to establish a new connection for every touch.
Messages can be small and frequent.

Example event types:

-   `press`: a button was pressed.
-   `release`: a button was released.
-   `move`: the movement control changed position.
-   `ping` / `pong`: optional timing and connection diagnostics.

The receiver should avoid expensive work in the input path. It should
parse the event, validate it, and dispatch the corresponding action
quickly.

Potential sources of delay or jitter include:

-   Wi-Fi congestion, weak signal, or router client isolation.
-   Browser scheduling and touch-event handling.
-   Too-frequent movement updates or excessive logging.
-   Delays in the Windows input-injection method.
-   The game not accepting the chosen input method.
-   Poor handling of held buttons, releases, or reconnects.

WebSocket itself is not expected to be the main bottleneck, but this
must be measured on the actual devices.

## 3. How the phone reaches the PC

`localhost` always refers to the device on which it is used. If the
phone opens `http://localhost:8080`, it looks for a server on the phone,
not the PC.

Instead, the phone connects to the PC's **local network IP address**.

Example addresses below are placeholders:

-   Controller page: `http://192.168.1.5:8080`
-   WebSocket endpoint: `ws://192.168.1.5:8765`

Replace `192.168.1.5` with the PC's actual LAN IPv4 address.

Requirements:

-   Both devices must be able to reach each other over the LAN.
-   The PC's firewall must allow the required ports on the **Private**
    network profile only.
-   Guest Wi-Fi or router client/AP isolation may block communication
    between devices.
-   Do not expose the receiver ports directly to the public internet.
-   The PC's LAN IP can change; a DHCP reservation or configurable
    address may help later.

A local browser page can communicate with a server hosted on another
device. It does not need to run on the phone's own `localhost`.

## 4. First milestone: prove the input pipeline

Before implementing classic attack/defense controls, gestures, or
shot-cancel logic, validate these stages independently.

### Test A --- Network connectivity

-   Start a minimal receiver on Windows.
-   Open the test page on Android using the PC's LAN IP.
-   Establish one WebSocket connection.
-   Display connection status on the phone.
-   Send a test message and confirm that the PC receives it.

### Test B --- Message timing

-   Include a sequence number and timestamp in each test event.
-   Measure round-trip time using a ping/pong exchange.
-   Record minimum, median, 95th percentile, and maximum round-trip time
    over a useful sample.
-   Test with both devices near the router and at the intended playing
    position.
-   Repeat under typical home network load.

**Important:** Round-trip time is not the same as one-way input latency.
It is a useful diagnostic, not a direct measurement of the complete
touch-to-game delay. Avoid claiming precise one-way latency unless
clocks are synchronized or the measurement method accounts for clock
offset.

### Test C --- Windows input delivery

-   Map one test action to a harmless, configurable key.
-   Confirm that a press and release are delivered correctly.
-   Test repeated presses, held inputs, focus changes, disconnects, and
    reconnects.
-   Verify whether the target game accepts the selected input method.

### Test D --- End-to-end check

Only after A--C work, test an action in-game and assess perceived
responsiveness. If possible, use a high-frame-rate video recording of
the phone touch and PC display to estimate visible end-to-end delay.
Treat this as an approximate measurement.

## 5. Input protocol principles

Keep the initial protocol small and explicit. For example:

``` json
{
  "type": "press",
  "button": "pass",
  "seq": 12
}
```

A release event should be sent when a held control ends:

``` json
{
  "type": "release",
  "button": "pass",
  "seq": 13
}
```

These are illustrative message formats, not a finalized protocol.

Implementation requirements:

-   Validate every incoming message and reject unknown actions.
-   Keep button press/release state consistent.
-   Release all held inputs when the phone disconnects or the receiver
    shuts down.
-   Include a sequence number for diagnostics.
-   Avoid logging every high-frequency movement event during normal
    operation.
-   Add reconnect behavior and a clear connection indicator.
-   Do not allow arbitrary incoming messages to execute arbitrary system
    commands.

## 6. Browser UI versus native Android

  -----------------------------------------------------------------------
  Option                  Advantages              Trade-offs
  ----------------------- ----------------------- -----------------------
  Browser + WebSocket     Fastest way to test; no Browser lifecycle and
                          Android app             touch handling need
                          installation or build   validation
                          toolchain               

  Native Android +        More control over touch More development and
  WebSocket               events, gestures, and   packaging work; network
                          lifecycle               latency still exists
  -----------------------------------------------------------------------

A native app is not automatically lower-latency. First measure the
browser prototype. Move to native Android only if testing reveals a
concrete limitation.

## 7. Keyboard versus virtual gamepad

Keyboard injection is a useful first experiment, but it may not be the
best final mapping for controller-style play.

Investigate a virtual gamepad if the game and PC setup support it. A
virtual gamepad could better represent analog movement and controller
buttons, but it adds setup and compatibility work. Do not assume that
either approach works in eFootball until tested.

## 8. Development environment

For the initial browser-based prototype:

-   Windows PC
-   Python 3.11+ (64-bit)
-   A Python virtual environment
-   The required Python packages
-   A modern Android browser
-   Both devices connected to the same reachable local network

Android Studio, the Android SDK, Gradle, and Node.js are **not
required** for the initial webpage-based test. They may become relevant
if the project later becomes a native Android application or adopts a
different frontend toolchain.

## 9. Suggested implementation order

1.  Create the smallest possible WebSocket connectivity test.
2.  Confirm the phone can reach the PC over the LAN.
3.  Measure round-trip timing and connection stability.
4.  Validate Windows input press/release behavior.
5.  Confirm the chosen input method works with the game.
6.  Build a basic touch layout with configurable actions.
7.  Add attack/defense modes and gesture behavior.
8.  Re-measure latency and reliability after each major change.
9.  Consider native Android or a virtual gamepad only when test results
    justify the extra complexity.

## 10. Security and reliability checklist

-   [ ] Bind only to the needed local interfaces and ports.
-   [ ] Allow access through Windows Firewall only on the Private
    network profile.
-   [ ] Do not forward the receiver ports from the router to the
    internet.
-   [ ] Validate incoming messages and allowed button names.
-   [ ] Release held inputs on disconnect, timeout, and shutdown.
-   [ ] Show connection state on the phone.
-   [ ] Test reconnect behavior and stale-input cleanup.
-   [ ] Keep the initial receiver limited to controller events; no
    arbitrary command execution.

## 11. Current unknowns

These are not yet proven:

-   Actual touch-to-game latency.
-   Reliability of the local Wi-Fi path in the intended setup.
-   Whether keyboard injection is accepted consistently by the game.
-   Whether a virtual gamepad is necessary or preferable.
-   The correct control mappings for the user's eFootball setup.
-   Whether browser touch handling is sufficient for the intended
    gestures.

**Bottom line:** WebSocket over a local network is a reasonable starting
point and is not inherently expensive. Use the first prototype to
measure the full input path before deciding whether to keep the browser
UI, switch to native Android, or change the PC input method.
