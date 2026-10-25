/**
 * eFootball Touch Bridge - Client Controller & Diagnostic Engine
 * High-performance, low-overhead WebSocket transport with sub-millisecond precision.
 */

const DEFAULT_GESTURES = {
  pass: {
    name: "PASS / MATCH-UP",
    baseKey: "s",
    up: { key: "w", presets: ["w", "lshift+w", "a"] },
    down: { key: "s", presets: ["s", "c+s", "e+s"] },
    left: { key: "a", presets: ["a", "c+a", "q"] },
    right: { key: "e+s", presets: ["e+s", "lshift+s", "space"] }
  },
  shoot: {
    name: "SHOOT / CLEAR",
    baseKey: "d",
    up: { key: "w+d", presets: ["w+d", "q+d", "lshift+d"] },
    down: { key: "c+d", presets: ["c+d", "z+d", "d"] },
    left: { key: "a+d", presets: ["a+d", "e+d", "space+d"] },
    right: { key: "e+d", presets: ["e+d", "lshift+d", "c"] }
  },
  through: {
    name: "THROUGH / GK RUSH",
    baseKey: "w",
    up: { key: "lshift+w", presets: ["lshift+w", "q+w", "a+w"] },
    down: { key: "w", presets: ["w", "s+w", "c+w"] },
    left: { key: "a+w", presets: ["a+w", "q+w", "s"] },
    right: { key: "e+w", presets: ["e+w", "lshift+w", "space"] }
  },
  def: {
    name: "DEF / RUN",
    baseKey: "q",
    right: { key: "e", presets: ["e", "e+q", "lshift"] },
    left: { key: "s", presets: ["s", "s+q", "c"] },
    up: { key: "d", presets: ["d", "w", "d+q"] },
    down: { key: "z", presets: ["z", "c", "s"] }
  }
};

// Application State
const state = {
  ws: null,
  wsUrl: `ws://${window.location.hostname || '127.0.0.1'}:8765`,
  isConnected: false,
  seq: 1,
  msgSent: 0,
  msgRecv: 0,
  
  // Benchmark (Milestone Test B)
  benchmarkRunning: true,
  benchmarkHz: 20,
  benchmarkTimer: null,
  rttSamples: [], // sliding window of RTT values in ms
  maxSamples: 100,

  // Settings
  hapticEnabled: true,
  liveInjection: true,
  wakeLock: null,
  activeMode: 'attack', // 'attack' | 'defense'

  // Joystick state
  joystickPointerId: null,
  joystickBaseX: 0,
  joystickBaseY: 0,
  joystickRadius: 55,
  joystickDeadzone: 0.15,
  lastJoyX: 0,
  lastJoyY: 0,
  lastJoyDir: 'IDLE',

  // Active held buttons
  heldButtons: new Set(),

  // HUD Layout Customization
  isEditingLayout: false,
  hudBtnScale: 1.0,
  hudBtnOpacity: 0.95,
  selectedBtnWrap: null,
  customButtons: [],

  // Swipe Gestures
  gestures: JSON.parse(JSON.stringify(DEFAULT_GESTURES)),
  activeGestureBtnTab: 'pass',
  swipeBufferMs: 70, // Recognition buffer window (ms) to distinguish flick from tap

  // Game Profiles System
  profiles: {},
  currentProfile: 'eFootball',
};

// Web Audio synthesizer for tactile instant click
let audioCtx = null;
function playTactileClick(freq = 240, duration = 0.02) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Ignore audio errors
  }
}

function triggerHaptic(duration = 15) {
  if (state.hapticEnabled && navigator.vibrate) {
    try {
      navigator.vibrate(duration);
    } catch (e) {}
  }
  playTactileClick();
}

// ================= DOM Elements =================
const elements = {
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  liveRttBadge: document.getElementById('live-rtt-badge'),
  valPeer: document.getElementById('val-peer'),
  valMsgCounts: document.getElementById('val-msg-counts'),
  wsAddressInput: document.getElementById('ws-address-input'),
  btnReconnect: document.getElementById('btn-reconnect'),
  btnSendEcho: document.getElementById('btn-send-echo'),
  echoStatusMsg: document.getElementById('echo-status-msg'),
  
  // Benchmark
  btnToggleBenchmark: document.getElementById('btn-toggle-benchmark'),
  metricCurrentRtt: document.getElementById('metric-current-rtt'),
  metricMedianRtt: document.getElementById('metric-median-rtt'),
  metricP95Rtt: document.getElementById('metric-p95-rtt'),
  metricMinMaxRtt: document.getElementById('metric-minmax-rtt'),
  latencyCanvas: document.getElementById('latency-canvas'),

  // Test C
  btnTestAction: document.getElementById('btn-test-action'),
  chkLiveInjection: document.getElementById('chk-hardware-injection'),
  chkHaptic: document.getElementById('chk-haptic-feedback'),
  heldKeysMonitor: document.getElementById('held-keys-monitor'),
  logEntries: document.getElementById('log-entries'),
  btnClearLog: document.getElementById('btn-clear-log'),

  // Tabs & Tools
  tabBtnDiag: document.getElementById('tab-btn-diagnostics'),
  tabBtnCtrl: document.getElementById('tab-btn-controller'),
  panelDiag: document.getElementById('diagnostics-panel'),
  panelCtrl: document.getElementById('controller-panel'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  btnWakeLock: document.getElementById('btn-wakelock'),
  disconnectedModal: document.getElementById('disconnected-modal'),
  modalReconnectBtn: document.getElementById('modal-reconnect-btn'),

  // HUD
  joystickZone: document.getElementById('joystick-zone'),
  joystickBase: document.getElementById('joystick-base'),
  joystickStick: document.getElementById('joystick-stick'),
  joyHudX: document.getElementById('joy-hud-x'),
  joyHudY: document.getElementById('joy-hud-y'),
  joyHudDir: document.getElementById('joy-hud-dir'),
  hudRttVal: document.getElementById('hud-rtt-val'),

  // Layout Customization
  btnToggleEditLayout: document.getElementById('btn-toggle-edit-layout'),
  layoutEditorToolbar: document.getElementById('layout-editor-toolbar'),
  toolbarSelectionLabel: document.getElementById('toolbar-selection-label'),
  btnAddCustomButton: document.getElementById('btn-add-custom-button'),
  sliderBtnSize: document.getElementById('slider-btn-size'),
  badgeSizeVal: document.getElementById('badge-size-val'),
  sliderBtnOpacity: document.getElementById('slider-btn-opacity'),
  btnDeleteSelectedBtn: document.getElementById('btn-delete-selected-btn'),
  btnResetLayout: document.getElementById('btn-reset-layout'),
  btnSaveLayout: document.getElementById('btn-save-layout'),

  // Add Custom Button Modal
  modalAddButton: document.getElementById('modal-add-button'),
  btnCloseAddModal: document.getElementById('btn-close-add-modal'),
  btnCancelAddModal: document.getElementById('btn-cancel-add-modal'),
  btnConfirmAddButton: document.getElementById('btn-confirm-add-button'),
  inputCustomLabel: document.getElementById('input-custom-label'),
  inputCustomKey: document.getElementById('input-custom-key'),
  customBtnColorSelect: document.getElementById('custom-btn-color-select'),

  // Swipe Gestures
  btnOpenGestures: document.getElementById('btn-open-gestures'),
  gesturesModal: document.getElementById('gestures-modal'),
  btnCloseGestures: document.getElementById('btn-close-gestures'),
  gestureTabs: document.getElementById('gesture-tabs'),
  gestureSlotsList: document.getElementById('gesture-slots-list'),
  sliderSwipeBuffer: document.getElementById('slider-swipe-buffer'),
  badgeSwipeBufferVal: document.getElementById('badge-swipe-buffer-val'),
  btnResetGestures: document.getElementById('btn-reset-gestures'),
  btnSaveGestures: document.getElementById('btn-save-gestures'),

  // Game Profiles
  btnOpenProfiles: document.getElementById('btn-open-profiles'),
  modalProfiles: document.getElementById('modal-profiles'),
  btnCloseProfiles: document.getElementById('btn-close-profiles'),
  btnDoneProfiles: document.getElementById('btn-done-profiles'),
  selectProfileChoice: document.getElementById('select-profile-choice'),
  btnNewProfile: document.getElementById('btn-new-profile'),
  btnRenameProfile: document.getElementById('btn-rename-profile'),
  btnDeleteProfile: document.getElementById('btn-delete-profile'),
  btnExportProfile: document.getElementById('btn-export-profile'),
  btnImportProfileTrigger: document.getElementById('btn-import-profile-trigger'),
  inputImportProfileFile: document.getElementById('input-import-profile-file'),
  profileSummaryDetails: document.getElementById('profile-summary-details'),
};

// ================= Logging UI =================
function addLogEntry(text, type = 'info') {
  if (!elements.logEntries) return;
  const entry = document.createElement('div');
  entry.className = `log-entry`;
  const timeStr = new Date().toLocaleTimeString().split(' ')[0] + '.' + String(Date.now() % 1000).padStart(3, '0');
  entry.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-type-${type}">${text}</span>`;
  elements.logEntries.prepend(entry);
  if (elements.logEntries.children.length > 30) {
    elements.logEntries.removeChild(elements.logEntries.lastChild);
  }
}

// ================= WebSocket Transport =================
function connectWebSocket() {
  const url = elements.wsAddressInput.value.trim() || state.wsUrl;
  state.wsUrl = url;

  if (state.ws) {
    try {
      state.ws.close();
    } catch (e) {}
  }

  setConnectionState('connecting', 'Connecting...');
  addLogEntry(`Initiating WebSocket to ${url}`, 'info');

  try {
    state.ws = new WebSocket(url);
  } catch (err) {
    setConnectionState('disconnected', 'Connection Failed');
    addLogEntry(`WebSocket constructor error: ${err.message}`, 'release');
    return;
  }

  state.ws.onopen = () => {
    setConnectionState('connected', 'Connected');
    elements.valPeer.textContent = url;
    elements.disconnectedModal.classList.add('hidden');
    addLogEntry(`WebSocket Connected to ${url}`, 'press');

    // Notify server of client presence
    sendJson({
      type: 'hello',
      client: 'Android Touch Client',
      seq: state.seq++,
      injection: state.liveInjection
    });

    syncAllMappingsToServer();
    startBenchmark();
  };

  state.ws.onmessage = (event) => {
    state.msgRecv++;
    updateMsgCounts();

    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (e) {
      console.warn("Non-JSON message:", event.data);
    }
  };

  state.ws.onclose = (event) => {
    setConnectionState('disconnected', 'Disconnected');
    stopBenchmark();
    addLogEntry(`WebSocket Disconnected (Code: ${event.code})`, 'release');
    
    // Release any locally held buttons visually
    state.heldButtons.clear();
    updateHeldMonitor();
  };

  state.ws.onerror = (err) => {
    setConnectionState('disconnected', 'Error');
    addLogEntry(`WebSocket Error`, 'release');
  };
}

function setConnectionState(status, label) {
  state.isConnected = (status === 'connected');
  elements.statusDot.className = `status-dot ${status}`;
  elements.statusText.textContent = label;
  
  if (status === 'disconnected') {
    elements.liveRttBadge.textContent = '-- ms';
    elements.hudRttVal.textContent = '-- ms';
  }
}

function updateMsgCounts() {
  if (elements.valMsgCounts) {
    elements.valMsgCounts.textContent = `${state.msgSent} / ${state.msgRecv}`;
  }
}

function sendJson(payload) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    state.ws.send(JSON.stringify(payload));
    state.msgSent++;
    updateMsgCounts();
    return true;
  } catch (err) {
    console.error("WebSocket send error:", err);
    return false;
  }
}

// ================= Server Message Processing =================
function handleServerMessage(msg) {
  if (msg.type === 'pong') {
    const now = performance.now();
    const rtt = Math.max(0, now - msg.client_time);
    recordRtt(rtt);
  } else if (msg.type === 'echo_reply') {
    elements.echoStatusMsg.textContent = `Echo ACK in ${msg.duration_ms ? msg.duration_ms.toFixed(1) + 'ms' : 'OK'}`;
    setTimeout(() => { elements.echoStatusMsg.textContent = ''; }, 3000);
    addLogEntry(`Probe reply received: ${msg.message || 'OK'}`, 'info');
  } else if (msg.type === 'status_update') {
    if (msg.held_keys) {
      elements.heldKeysMonitor.textContent = `Active Keys: ${msg.held_keys.length ? msg.held_keys.join(', ') : 'None'}`;
    }
  }
}

// ================= Benchmark (Milestone Test B) =================
function startBenchmark() {
  stopBenchmark();
  state.benchmarkRunning = true;
  elements.btnToggleBenchmark.textContent = 'Stop Benchmark';

  const intervalMs = Math.round(1000 / state.benchmarkHz);
  state.benchmarkTimer = setInterval(() => {
    if (state.isConnected) {
      sendJson({
        type: 'ping',
        client_time: performance.now(),
        seq: state.seq++
      });
    }
  }, intervalMs);
}

function stopBenchmark() {
  state.benchmarkRunning = false;
  if (state.benchmarkTimer) {
    clearInterval(state.benchmarkTimer);
    state.benchmarkTimer = null;
  }
  elements.btnToggleBenchmark.textContent = 'Start Benchmark';
}

function recordRtt(rtt) {
  state.rttSamples.push(rtt);
  if (state.rttSamples.length > state.maxSamples) {
    state.rttSamples.shift();
  }

  // Calculate Stats
  const sorted = [...state.rttSamples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  const currentStr = rtt.toFixed(1);
  elements.metricCurrentRtt.textContent = currentStr;
  elements.liveRttBadge.textContent = `${currentStr} ms`;
  elements.hudRttVal.textContent = `${currentStr} ms`;

  elements.metricMedianRtt.textContent = median.toFixed(1);
  elements.metricP95Rtt.textContent = p95.toFixed(1);
  elements.metricMinMaxRtt.textContent = `${min.toFixed(1)} / ${max.toFixed(1)}`;

  drawLatencyGraph();
}

// Latency Sparkline Canvas
function drawLatencyGraph() {
  const canvas = elements.latencyCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (state.rttSamples.length < 2) return;

  // Background grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
  ctx.stroke();

  // Draw sparkline
  const maxVal = Math.max(30, ...state.rttSamples);
  const step = w / (state.maxSamples - 1);
  const startOffset = state.maxSamples - state.rttSamples.length;

  ctx.beginPath();
  state.rttSamples.forEach((val, i) => {
    const x = (startOffset + i) * step;
    const y = h - (val / maxVal) * (h - 12) - 6;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  // Gradient stroke
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#00f2fe');
  grad.addColorStop(1, '#38ef7d');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ================= Input Action Handling (Milestone Test C & HUD) =================
function handleButtonPress(actionName, btnElement) {
  if (state.heldButtons.has(actionName)) return;
  state.heldButtons.add(actionName);

  if (btnElement) {
    btnElement.classList.add('pressed');
  }

  triggerHaptic(18);
  addLogEntry(`PRESS: [${actionName.toUpperCase()}]`, 'press');

  let targetAction = actionName;
  if (btnElement && btnElement.getAttribute('data-key')) {
    targetAction = btnElement.getAttribute('data-key');
  }

  sendJson({
    type: 'press',
    button: targetAction,
    combo: targetAction,
    seq: state.seq++,
    timestamp: performance.now()
  });

  updateHeldMonitor();
}

function handleButtonRelease(actionName, btnElement) {
  if (!state.heldButtons.has(actionName)) return;
  state.heldButtons.delete(actionName);

  if (btnElement) {
    btnElement.classList.remove('pressed');
  }

  addLogEntry(`RELEASE: [${actionName.toUpperCase()}]`, 'release');

  let targetAction = actionName;
  if (btnElement && btnElement.getAttribute('data-key')) {
    targetAction = btnElement.getAttribute('data-key');
  }

  sendJson({
    type: 'release',
    button: targetAction,
    combo: targetAction,
    seq: state.seq++,
    timestamp: performance.now()
  });

  updateHeldMonitor();
}

function updateHeldMonitor() {
  const heldArr = Array.from(state.heldButtons);
  elements.heldKeysMonitor.textContent = `Active Keys: ${heldArr.length ? heldArr.join(', ') : 'None'}`;
}

// Bind button touch/pointer events cleanly
function bindActionButton(btn) {
  if (btn.getAttribute('data-swipeable') === 'true') {
    bindSwipeableButton(btn);
    return;
  }

  const action = btn.getAttribute('data-action');
  if (!action) return;

  btn.addEventListener('pointerdown', (e) => {
    if (state.isEditingLayout) return; // Prevent gameplay injection while moving buttons
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    handleButtonPress(action, btn);
  });

  btn.addEventListener('pointerup', (e) => {
    if (state.isEditingLayout) return;
    e.preventDefault();
    try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
    handleButtonRelease(action, btn);
  });

  btn.addEventListener('pointercancel', (e) => {
    if (state.isEditingLayout) return;
    e.preventDefault();
    try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
    handleButtonRelease(action, btn);
  });
}

// Bind swipeable action buttons (Pass, Shoot, Through, Cross) with gesture buffer resolver
function bindSwipeableButton(btn) {
  const baseAction = btn.getAttribute('data-action');
  if (!baseAction) return;

  let touchInfo = null;

  btn.addEventListener('pointerdown', (e) => {
    if (state.isEditingLayout) return;
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);

    const baseKey = (state.gestures[baseAction] && state.gestures[baseAction].baseKey) || baseAction;

    if (touchInfo && touchInfo.timer) {
      clearTimeout(touchInfo.timer);
    }

    touchInfo = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      activeDir: null,
      currentKey: null,
      baseKey: baseKey,
      hasPressedBaseKey: false,
      hasPressedCombo: false,
      timer: null
    };

    btn.classList.add('pressed');
    triggerHaptic(15);

    // Buffer window: wait slightly before pressing the normal base key
    // If player swipes, the timer is cancelled and the base key is NEVER triggered!
    const bufferMs = state.swipeBufferMs || 70;
    touchInfo.timer = setTimeout(() => {
      if (touchInfo && !touchInfo.hasPressedCombo && !touchInfo.activeDir) {
        touchInfo.hasPressedBaseKey = true;
        touchInfo.currentKey = baseKey;
        handleButtonPress(baseKey, null);
      }
    }, bufferMs);
  });

  btn.addEventListener('pointermove', (e) => {
    if (state.isEditingLayout || !touchInfo || e.pointerId !== touchInfo.pointerId) return;
    e.preventDefault();

    const dx = e.clientX - touchInfo.startX;
    const dy = e.clientY - touchInfo.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const SWIPE_THRESHOLD = 14;

    if (dist >= SWIPE_THRESHOLD) {
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      let dir = 'right';
      if (angle >= -135 && angle < -45) dir = 'up';
      else if (angle >= 45 && angle < 135) dir = 'down';
      else if (angle >= -45 && angle < 45) dir = 'right';
      else dir = 'left';

      if (dir !== touchInfo.activeDir) {
        // Cancel base key timer so normal button NEVER fires
        if (touchInfo.timer) {
          clearTimeout(touchInfo.timer);
          touchInfo.timer = null;
        }

        // Highlight new active arrow
        btn.querySelectorAll('.swipe-dir-arrow').forEach(a => a.classList.remove('active'));
        const activeArrow = btn.querySelector(`.swipe-dir-arrow.arrow-${dir}`);
        if (activeArrow) activeArrow.classList.add('active');

        // Look up mapped key/combo for this gesture
        const gestureConfig = state.gestures[baseAction];
        const newKey = (gestureConfig && gestureConfig[dir] && gestureConfig[dir].key) || `${baseAction}_${dir}`;

        if (newKey !== touchInfo.currentKey) {
          if (touchInfo.currentKey) {
            handleButtonRelease(touchInfo.currentKey, null);
          }
          handleButtonPress(newKey, null);
          touchInfo.currentKey = newKey;
          touchInfo.hasPressedCombo = true;
          touchInfo.activeDir = dir;
          triggerHaptic(14);
          addLogEntry(`SWIPE [${baseAction.toUpperCase()} ${dir.toUpperCase()}]: ${newKey.toUpperCase()}`, 'info');
        }
      }
    } else if (dist < 10 && touchInfo.activeDir) {
      // Revert if finger slides back to center
      btn.querySelectorAll('.swipe-dir-arrow').forEach(a => a.classList.remove('active'));
      const baseKey = (state.gestures[baseAction] && state.gestures[baseAction].baseKey) || baseAction;

      if (touchInfo.currentKey && touchInfo.currentKey !== baseKey) {
        handleButtonRelease(touchInfo.currentKey, null);
        handleButtonPress(baseKey, null);
        touchInfo.currentKey = baseKey;
        touchInfo.activeDir = null;
        touchInfo.hasPressedBaseKey = true;
      }
    }
  });

  const endSwipe = (e) => {
    if (state.isEditingLayout || !touchInfo || e.pointerId !== touchInfo.pointerId) return;
    e.preventDefault();
    try { btn.releasePointerCapture(e.pointerId); } catch (err) {}

    btn.classList.remove('pressed');
    btn.querySelectorAll('.swipe-dir-arrow').forEach(a => a.classList.remove('active'));

    // Cancel pending buffer timer
    if (touchInfo.timer) {
      clearTimeout(touchInfo.timer);
      touchInfo.timer = null;
    }

    if (touchInfo.hasPressedCombo && touchInfo.currentKey) {
      // Release swipe combo cleanly
      handleButtonRelease(touchInfo.currentKey, null);
    } else if (touchInfo.hasPressedBaseKey && touchInfo.currentKey) {
      // Release held base key
      handleButtonRelease(touchInfo.currentKey, null);
    } else {
      // Quick tap (< buffer window) without swipe -> Execute clean tap
      const baseKey = touchInfo.baseKey;
      handleButtonPress(baseKey, null);
      setTimeout(() => {
        handleButtonRelease(baseKey, null);
      }, 35);
    }

    touchInfo = null;
  };

  btn.addEventListener('pointerup', endSwipe);
  btn.addEventListener('pointercancel', endSwipe);
}

// ================= Dynamic Floating Joystick (HUD Left) =================
function setupDynamicJoystick() {
  const zone = elements.joystickZone;
  const base = elements.joystickBase;
  const stick = elements.joystickStick;
  if (!zone || !base || !stick) return;

  zone.addEventListener('pointerdown', (e) => {
    if (state.joystickPointerId !== null) return;
    e.preventDefault();
    
    state.joystickPointerId = e.pointerId;
    zone.setPointerCapture(e.pointerId);

    const rect = zone.getBoundingClientRect();
    state.joystickBaseX = e.clientX - rect.left;
    state.joystickBaseY = e.clientY - rect.top;

    base.style.left = `${state.joystickBaseX}px`;
    base.style.top = `${state.joystickBaseY}px`;
    stick.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
    base.classList.remove('hidden');

    triggerHaptic(10);
  });

  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== state.joystickPointerId) return;
    e.preventDefault();

    const rect = zone.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    let dx = currentX - state.joystickBaseX;
    let dy = currentY - state.joystickBaseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Clamp to max radius
    if (dist > state.joystickRadius) {
      dx = (dx / dist) * state.joystickRadius;
      dy = (dy / dist) * state.joystickRadius;
    }

    stick.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;

    // Calculate normalized vector [-1.0, 1.0]
    let normX = dx / state.joystickRadius;
    let normY = dy / state.joystickRadius;

    // Apply Deadzone
    const magnitude = Math.sqrt(normX * normX + normY * normY);
    if (magnitude < state.joystickDeadzone) {
      normX = 0;
      normY = 0;
    }

    // Determine direction string for HUD
    let dir = 'IDLE';
    if (normX !== 0 || normY !== 0) {
      const angle = Math.atan2(normY, normX) * (180 / Math.PI); // -180 to 180
      if (angle >= -22.5 && angle <= 22.5) dir = 'RIGHT';
      else if (angle > 22.5 && angle < 67.5) dir = 'DOWN-RIGHT';
      else if (angle >= 67.5 && angle <= 112.5) dir = 'DOWN';
      else if (angle > 112.5 && angle < 157.5) dir = 'DOWN-LEFT';
      else if (angle >= 157.5 || angle <= -157.5) dir = 'LEFT';
      else if (angle > -157.5 && angle < -112.5) dir = 'UP-LEFT';
      else if (angle >= -112.5 && angle <= -67.5) dir = 'UP';
      else if (angle > -67.5 && angle < -22.5) dir = 'UP-RIGHT';
    }

    elements.joyHudX.textContent = `X: ${normX.toFixed(2)}`;
    elements.joyHudY.textContent = `Y: ${normY.toFixed(2)}`;
    elements.joyHudDir.textContent = `DIR: ${dir}`;

    // Send joystick update only when vector changes meaningfully to save network overhead
    if (Math.abs(normX - state.lastJoyX) > 0.05 || Math.abs(normY - state.lastJoyY) > 0.05 || dir !== state.lastJoyDir) {
      state.lastJoyX = normX;
      state.lastJoyY = normY;
      state.lastJoyDir = dir;

      sendJson({
        type: 'move',
        x: normX,
        y: normY,
        dir: dir,
        seq: state.seq++
      });
    }
  });

  const releaseJoystick = (e) => {
    if (e.pointerId !== state.joystickPointerId) return;
    e.preventDefault();

    try { zone.releasePointerCapture(e.pointerId); } catch (err) {}
    state.joystickPointerId = null;
    base.classList.add('hidden');
    stick.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;

    elements.joyHudX.textContent = `X: 0.00`;
    elements.joyHudY.textContent = `Y: 0.00`;
    elements.joyHudDir.textContent = `DIR: IDLE`;
    state.lastJoyX = 0;
    state.lastJoyY = 0;
    state.lastJoyDir = 'IDLE';

    sendJson({
      type: 'move',
      x: 0,
      y: 0,
      dir: 'IDLE',
      seq: state.seq++
    });
  };

  zone.addEventListener('pointerup', releaseJoystick);
  zone.addEventListener('pointercancel', releaseJoystick);
}

// ================= Fullscreen & WakeLock =================
async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    try {
      await document.documentElement.requestFullscreen();
      // Try screen orientation lock to landscape if supported
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {
      console.warn("Fullscreen error:", e);
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
      elements.btnWakeLock.style.color = '#00e676';
      addLogEntry("Screen Wake Lock engaged (Display will stay ON)", "info");
      state.wakeLock.addEventListener('release', () => {
        elements.btnWakeLock.style.color = '';
      });
    } catch (err) {
      console.warn("WakeLock error:", err);
    }
  }
}

// ================= Initialization & Event Listeners =================
function init() {
  // Populate default ws address based on current URL
  const defaultWsHost = window.location.hostname || '127.0.0.1';
  elements.wsAddressInput.value = `ws://${defaultWsHost}:8765`;
  state.wsUrl = elements.wsAddressInput.value;

  // Reconnect buttons
  elements.btnReconnect.addEventListener('click', connectWebSocket);
  elements.modalReconnectBtn.addEventListener('click', connectWebSocket);

  // Echo test button
  elements.btnSendEcho.addEventListener('click', () => {
    sendJson({
      type: 'echo',
      message: 'Hello PC Receiver from Phone',
      seq: state.seq++,
      timestamp: performance.now()
    });
    elements.echoStatusMsg.textContent = 'Probe sent...';
  });

  // Benchmark toggle
  elements.btnToggleBenchmark.addEventListener('click', () => {
    if (state.benchmarkRunning) {
      stopBenchmark();
    } else {
      startBenchmark();
    }
  });

  // Benchmark Rate chips
  document.querySelectorAll('.rate-select .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.rate-select .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.benchmarkHz = parseInt(chip.getAttribute('data-hz'), 10) || 20;
      if (state.benchmarkRunning) {
        startBenchmark();
      }
    });
  });

  // Bind Test C Action Button
  bindActionButton(elements.btnTestAction);

  // Bind all HUD action buttons
  document.querySelectorAll('.hud-game-btn').forEach(btn => {
    bindActionButton(btn);
  });

  // Setup Joystick
  setupDynamicJoystick();

  // Settings Toggles
  elements.chkLiveInjection.addEventListener('change', (e) => {
    state.liveInjection = e.target.checked;
    sendJson({
      type: 'config',
      enable_injection: state.liveInjection,
      seq: state.seq++
    });
  });

  elements.chkHaptic.addEventListener('change', (e) => {
    state.hapticEnabled = e.target.checked;
  });

  elements.btnClearLog.addEventListener('click', () => {
    elements.logEntries.innerHTML = '';
  });

  // Tab Switching
  elements.tabBtnDiag.addEventListener('click', () => {
    elements.tabBtnDiag.classList.add('active');
    elements.tabBtnCtrl.classList.remove('active');
    elements.panelDiag.classList.add('active');
    elements.panelCtrl.classList.remove('active');
  });

  elements.tabBtnCtrl.addEventListener('click', () => {
    elements.tabBtnCtrl.classList.add('active');
    elements.tabBtnDiag.classList.remove('active');
    elements.panelCtrl.classList.add('active');
    elements.panelDiag.classList.remove('active');
  });

  // Fullscreen & WakeLock
  elements.btnFullscreen.addEventListener('click', toggleFullscreen);
  elements.btnWakeLock.addEventListener('click', requestWakeLock);

  // Auto request WakeLock on user gesture
  document.addEventListener('pointerdown', () => {
    if (!state.wakeLock) {
      requestWakeLock();
    }
  }, { once: true });

  // PWA Installation Prompt
  let deferredPrompt = null;
  const btnInstall = document.getElementById('btn-install-pwa');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstall) {
      btnInstall.classList.remove('hidden');
      btnInstall.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          btnInstall.classList.add('hidden');
        }
        deferredPrompt = null;
      });
    }
  });

  window.addEventListener('appinstalled', () => {
    if (btnInstall) btnInstall.classList.add('hidden');
    addLogEntry("App successfully installed on home screen!", "info");
  });

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('PWA ServiceWorker registered with scope:', reg.scope);
    }).catch((err) => {
      console.warn('PWA ServiceWorker registration failed:', err);
    });
  }

  // Setup Layout Customization & Draggable Buttons
  loadSavedCustomButtons();
  setupDraggableButtons();
  loadSavedLayout();

  // Setup Add Custom Button Modal
  initCustomButtonModal();

  // Setup Gesture Engine & Custom Combos
  loadSavedGestures();
  initGesturesModal();

  // Setup Game Profiles System
  initProfilesSystem();

  if (elements.btnToggleEditLayout) {
    elements.btnToggleEditLayout.addEventListener('click', toggleEditLayout);
  }

  if (elements.btnSaveLayout) {
    elements.btnSaveLayout.addEventListener('click', toggleEditLayout);
  }

  if (elements.btnResetLayout) {
    elements.btnResetLayout.addEventListener('click', resetLayout);
  }

  if (elements.sliderBtnSize) {
    elements.sliderBtnSize.addEventListener('input', (e) => {
      const scale = parseFloat(e.target.value);
      if (elements.badgeSizeVal) {
        elements.badgeSizeVal.textContent = `${Math.round(scale * 100)}%`;
      }

      if (state.selectedBtnWrap) {
        // Individual button resizing!
        state.selectedBtnWrap.style.setProperty('--btn-custom-scale', scale);
        const id = state.selectedBtnWrap.id;
        const cb = state.customButtons.find(b => b.id === id);
        if (cb) {
          cb.scale = scale;
          saveCustomButtons();
        }
        saveCurrentLayout();
      } else {
        // Fallback global button scaling
        state.hudBtnScale = scale;
        document.documentElement.style.setProperty('--hud-btn-scale', scale);
        saveCurrentLayout();
      }
    });
  }

  if (elements.sliderBtnOpacity) {
    elements.sliderBtnOpacity.addEventListener('input', (e) => {
      const opacity = parseFloat(e.target.value);
      state.hudBtnOpacity = opacity;
      document.documentElement.style.setProperty('--hud-btn-opacity', opacity);
      saveCurrentLayout();
    });
  }

  // Initial Auto Connect
  connectWebSocket();
}

// ================= HUD Layout Customization System =================
function toggleEditLayout() {
  state.isEditingLayout = !state.isEditingLayout;
  const panel = elements.panelCtrl;
  const toolbar = elements.layoutEditorToolbar;
  const btnToggle = elements.btnToggleEditLayout;

  if (state.isEditingLayout) {
    panel.classList.add('editing-layout');
    toolbar.classList.remove('hidden');
    if (btnToggle) btnToggle.classList.add('active');
    triggerHaptic(20);
    addLogEntry("HUD Layout Customize Mode: Tap a button to select & resize, or drag to move", "info");
  } else {
    panel.classList.remove('editing-layout');
    toolbar.classList.add('hidden');
    if (btnToggle) btnToggle.classList.remove('active');
    deselectButtonForEdit();
    saveCurrentLayout();
    triggerHaptic(20);
    addLogEntry("HUD Layout Saved!", "press");
  }
}

function selectButtonForEdit(wrap) {
  if (!wrap) return;

  // Clear previous selection highlight
  document.querySelectorAll('.hud-btn-wrap.selected-btn').forEach(el => el.classList.remove('selected-btn'));

  wrap.classList.add('selected-btn');
  state.selectedBtnWrap = wrap;

  // Find human-readable label
  const atk = wrap.querySelector('.hud-btn-atk');
  const sub = wrap.querySelector('.hud-btn-sub');
  const labelText = atk ? atk.textContent.trim() : (wrap.getAttribute('data-btn-name') || wrap.id);
  const subText = sub ? ` ${sub.textContent.trim()}` : '';
  const fullLabel = `${labelText}${subText}`;

  if (elements.toolbarSelectionLabel) {
    elements.toolbarSelectionLabel.textContent = `🎯 Selected: ${fullLabel}`;
  }

  // Determine current scale
  const customScale = wrap.style.getPropertyValue('--btn-custom-scale');
  const currentScale = customScale ? parseFloat(customScale) : (state.hudBtnScale || 1.0);

  if (elements.sliderBtnSize) {
    elements.sliderBtnSize.value = currentScale;
  }
  if (elements.badgeSizeVal) {
    elements.badgeSizeVal.textContent = `${Math.round(currentScale * 100)}%`;
  }

  // Show/Hide Delete Button based on whether this is a custom button
  const isCustom = wrap.getAttribute('data-is-custom') === 'true' || wrap.classList.contains('custom-btn-wrap');
  if (elements.btnDeleteSelectedBtn) {
    if (isCustom) {
      elements.btnDeleteSelectedBtn.classList.remove('hidden');
    } else {
      elements.btnDeleteSelectedBtn.classList.add('hidden');
    }
  }

  triggerHaptic(12);
}

function deselectButtonForEdit() {
  document.querySelectorAll('.hud-btn-wrap.selected-btn').forEach(el => el.classList.remove('selected-btn'));
  state.selectedBtnWrap = null;

  if (elements.toolbarSelectionLabel) {
    elements.toolbarSelectionLabel.textContent = "📐 Tap a button to select & resize";
  }
  if (elements.sliderBtnSize) {
    elements.sliderBtnSize.value = state.hudBtnScale || 1.0;
  }
  if (elements.badgeSizeVal) {
    elements.badgeSizeVal.textContent = `${Math.round((state.hudBtnScale || 1.0) * 100)}%`;
  }
  if (elements.btnDeleteSelectedBtn) {
    elements.btnDeleteSelectedBtn.classList.add('hidden');
  }
}

function setupDraggableOnWrap(wrap) {
  wrap.addEventListener('pointerdown', (e) => {
    if (!state.isEditingLayout) return;
    e.preventDefault();
    e.stopPropagation();

    // Select this button immediately for individual resizing & editing
    selectButtonForEdit(wrap);

    wrap.setPointerCapture(e.pointerId);

    const parent = wrap.offsetParent || wrap.parentElement || document.getElementById('action-zone');
    const pRect = parent.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();

    const offsetX = e.clientX - wRect.left;
    const offsetY = e.clientY - wRect.top;

    const onPointerMove = (me) => {
      if (!state.isEditingLayout) return;
      me.preventDefault();

      const x = me.clientX - pRect.left - offsetX;
      const y = me.clientY - pRect.top - offsetY;

      // Allow dragging throughout the action cluster bounds
      const pctX = ((x / pRect.width) * 100);
      const pctY = ((y / pRect.height) * 100);

      wrap.style.left = `${pctX.toFixed(1)}%`;
      wrap.style.top = `${pctY.toFixed(1)}%`;
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
      wrap.style.transform = 'none';
    };

    const onPointerUp = (ue) => {
      wrap.removeEventListener('pointermove', onPointerMove);
      wrap.removeEventListener('pointerup', onPointerUp);
      wrap.removeEventListener('pointercancel', onPointerUp);
      try { wrap.releasePointerCapture(ue.pointerId); } catch (err) {}
      saveCurrentLayout();
    };

    wrap.addEventListener('pointermove', onPointerMove);
    wrap.addEventListener('pointerup', onPointerUp);
    wrap.addEventListener('pointercancel', onPointerUp);
  });
}

function setupDraggableButtons() {
  document.querySelectorAll('.hud-btn-wrap').forEach(wrap => {
    setupDraggableOnWrap(wrap);
  });
}

function saveCurrentLayout() {
  const positions = {};
  document.querySelectorAll('.hud-btn-wrap').forEach(wrap => {
    if (wrap.id) {
      const customScale = wrap.style.getPropertyValue('--btn-custom-scale');
      positions[wrap.id] = {
        left: wrap.style.left || '',
        top: wrap.style.top || '',
        scale: customScale ? parseFloat(customScale) : null
      };
    }
  });

  const layoutData = {
    btnScale: state.hudBtnScale || 1.0,
    btnOpacity: state.hudBtnOpacity || 0.95,
    positions
  };

  try {
    localStorage.setItem('efootball_hud_layout', JSON.stringify(layoutData));
  } catch (e) {
    console.warn("Storage save notice:", e);
  }
}

function loadSavedLayout() {
  const raw = localStorage.getItem('efootball_hud_layout');
  if (!raw) return;

  try {
    const layoutData = JSON.parse(raw);
    if (layoutData.btnScale) {
      state.hudBtnScale = layoutData.btnScale;
      document.documentElement.style.setProperty('--hud-btn-scale', layoutData.btnScale);
      if (elements.sliderBtnSize && !state.selectedBtnWrap) {
        elements.sliderBtnSize.value = layoutData.btnScale;
      }
    }
    if (layoutData.btnOpacity) {
      state.hudBtnOpacity = layoutData.btnOpacity;
      document.documentElement.style.setProperty('--hud-btn-opacity', layoutData.btnOpacity);
      if (elements.sliderBtnOpacity) elements.sliderBtnOpacity.value = layoutData.btnOpacity;
    }
    if (layoutData.positions) {
      if (layoutData.positions['wrap-action-cross'] && !layoutData.positions['wrap-action-def']) {
        layoutData.positions['wrap-action-def'] = layoutData.positions['wrap-action-cross'];
      }
      for (const [id, pos] of Object.entries(layoutData.positions)) {
        const el = document.getElementById(id);
        if (el) {
          if (pos.left && pos.top) {
            el.style.left = pos.left;
            el.style.top = pos.top;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.transform = 'none';
          }
          if (pos.scale) {
            el.style.setProperty('--btn-custom-scale', pos.scale);
          }
        }
      }
    }
  } catch (e) {
    console.warn("Could not load saved HUD layout:", e);
  }
}

function resetLayout() {
  localStorage.removeItem('efootball_hud_layout');
  state.hudBtnScale = 1.0;
  state.hudBtnOpacity = 0.95;
  document.documentElement.style.setProperty('--hud-btn-scale', '1.0');
  document.documentElement.style.setProperty('--hud-btn-opacity', '0.95');

  if (elements.sliderBtnSize) elements.sliderBtnSize.value = '1.0';
  if (elements.badgeSizeVal) elements.badgeSizeVal.textContent = '100%';
  if (elements.sliderBtnOpacity) elements.sliderBtnOpacity.value = '0.95';

  document.querySelectorAll('.hud-btn-wrap').forEach(wrap => {
    wrap.style.removeProperty('--btn-custom-scale');
    // Only reset positions of standard buttons; custom buttons remain where user places them
    if (!wrap.classList.contains('custom-btn-wrap')) {
      wrap.style.left = '';
      wrap.style.top = '';
      wrap.style.right = '';
      wrap.style.bottom = '';
      wrap.style.transform = '';
    }
  });

  deselectButtonForEdit();
  triggerHaptic(20);
  addLogEntry("Reset buttons to standard positions and default scales", "info");
}

// ================= Custom Buttons Engine (Add / Delete / Bind) =================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createCustomButtonElement(btnData) {
  const wrap = document.createElement('div');
  wrap.className = 'hud-btn-wrap custom-btn-wrap';
  wrap.id = btnData.id;
  wrap.setAttribute('data-is-custom', 'true');
  wrap.setAttribute('data-btn-name', btnData.label);

  if (btnData.left) wrap.style.left = btnData.left;
  if (btnData.top) wrap.style.top = btnData.top;
  if (btnData.left || btnData.top) {
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
    wrap.style.transform = 'none';
  } else {
    wrap.style.left = '30%';
    wrap.style.top = '30%';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
    wrap.style.transform = 'none';
  }

  if (btnData.scale) {
    wrap.style.setProperty('--btn-custom-scale', btnData.scale);
  }

  const btn = document.createElement('button');
  btn.className = `hud-game-btn theme-${btnData.color || 'cyan'}`;
  btn.id = `btn-${btnData.id}`;
  btn.setAttribute('data-action', btnData.id);
  btn.setAttribute('data-key', btnData.key);

  btn.innerHTML = `
    <span class="hud-btn-atk">${escapeHtml(btnData.label)}</span>
    <span class="hud-btn-sub">[${escapeHtml(btnData.key.toUpperCase())}]</span>
  `;

  wrap.appendChild(btn);

  // Bind gameplay input actions & layout drag events
  bindActionButton(btn);
  setupDraggableOnWrap(wrap);

  return wrap;
}

function saveCustomButtons() {
  try {
    localStorage.setItem('efootball_custom_buttons', JSON.stringify(state.customButtons));
  } catch (e) {
    console.warn("Could not save custom buttons:", e);
  }
}

function loadSavedCustomButtons() {
  const raw = localStorage.getItem('efootball_custom_buttons');
  if (!raw) return;
  try {
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      state.customButtons = list;
      const cluster = document.getElementById('action-cluster') || document.getElementById('action-zone');
      list.forEach(btnData => {
        if (!document.getElementById(btnData.id)) {
          const el = createCustomButtonElement(btnData);
          if (cluster) cluster.appendChild(el);
        }
      });
      syncAllMappingsToServer();
    }
  } catch (e) {
    console.warn("Could not parse saved custom buttons:", e);
  }
}

function initCustomButtonModal() {
  // "+ ADD BUTTON" toolbar button
  if (elements.btnAddCustomButton) {
    elements.btnAddCustomButton.addEventListener('click', () => {
      if (elements.modalAddButton) {
        elements.modalAddButton.classList.remove('hidden');
        if (elements.inputCustomLabel) {
          elements.inputCustomLabel.value = '';
          elements.inputCustomLabel.focus();
        }
        if (elements.inputCustomKey) {
          elements.inputCustomKey.value = '';
        }
        if (elements.customBtnColorSelect) {
          elements.customBtnColorSelect.querySelectorAll('.color-chip').forEach((chip, i) => {
            chip.classList.toggle('active', i === 0);
          });
        }
        triggerHaptic(15);
      }
    });
  }

  // Close & Cancel buttons
  if (elements.btnCloseAddModal) {
    elements.btnCloseAddModal.addEventListener('click', closeAddButtonModal);
  }
  if (elements.btnCancelAddModal) {
    elements.btnCancelAddModal.addEventListener('click', closeAddButtonModal);
  }

  // Color chips inside modal
  if (elements.customBtnColorSelect) {
    elements.customBtnColorSelect.querySelectorAll('.color-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        elements.customBtnColorSelect.querySelectorAll('.color-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        triggerHaptic(10);
      });
    });
  }

  // Preset chips inside modal
  document.querySelectorAll('.custom-preset-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const val = chip.getAttribute('data-val');
      if (elements.inputCustomKey && val) {
        elements.inputCustomKey.value = val;
        triggerHaptic(10);
      }
    });
  });

  // Confirm Create Button
  if (elements.btnConfirmAddButton) {
    elements.btnConfirmAddButton.addEventListener('click', () => {
      const label = (elements.inputCustomLabel.value || '').trim() || 'ACTION';
      const key = (elements.inputCustomKey.value || '').trim().toLowerCase() || 'space';
      const activeColorChip = elements.customBtnColorSelect ? elements.customBtnColorSelect.querySelector('.color-chip.active') : null;
      const color = activeColorChip ? activeColorChip.getAttribute('data-color') : 'cyan';

      const id = `custom-btn-${Date.now()}`;
      // Stagger new buttons so they don't overlap exactly
      const offsetCount = state.customButtons.length % 5;
      const initialLeft = `${10 + offsetCount * 14}%`;
      const initialTop = `${15 + offsetCount * 14}%`;

      const btnData = {
        id,
        label,
        key,
        color,
        left: initialLeft,
        top: initialTop,
        scale: 1.0
      };

      state.customButtons.push(btnData);
      saveCustomButtons();

      const cluster = document.getElementById('action-cluster') || document.getElementById('action-zone');
      const el = createCustomButtonElement(btnData);
      if (cluster) cluster.appendChild(el);

      syncAllMappingsToServer();
      closeAddButtonModal();

      // Immediately select the new button for dragging/resizing
      selectButtonForEdit(el);
      saveCurrentLayout();

      triggerHaptic(25);
      addLogEntry(`Created custom button: "${label}" [${key.toUpperCase()}]`, 'press');
    });
  }

  // Delete Selected Button
  if (elements.btnDeleteSelectedBtn) {
    elements.btnDeleteSelectedBtn.addEventListener('click', () => {
      if (!state.selectedBtnWrap) return;
      const id = state.selectedBtnWrap.id;
      const isCustom = state.selectedBtnWrap.getAttribute('data-is-custom') === 'true' || state.selectedBtnWrap.classList.contains('custom-btn-wrap');
      if (!isCustom) return;

      // Release any held key
      handleButtonRelease(id, state.selectedBtnWrap.querySelector('button'));

      // Remove from DOM
      state.selectedBtnWrap.remove();

      // Remove from state & localStorage
      state.customButtons = state.customButtons.filter(b => b.id !== id);
      saveCustomButtons();
      saveCurrentLayout();
      syncAllMappingsToServer();

      deselectButtonForEdit();
      triggerHaptic(20);
      addLogEntry(`Deleted custom button: ${id}`, 'release');
    });
  }
}

function closeAddButtonModal() {
  if (elements.modalAddButton) {
    elements.modalAddButton.classList.add('hidden');
  }
}

function syncAllMappingsToServer() {
  const mappings = {};
  // 1. Gesture mappings
  for (const [btn, cfg] of Object.entries(state.gestures)) {
    mappings[btn] = cfg.baseKey;
    mappings[`${btn}_up`] = cfg.up.key;
    mappings[`${btn}_down`] = cfg.down.key;
    mappings[`${btn}_left`] = cfg.left.key;
    mappings[`${btn}_right`] = cfg.right.key;
  }
  // 2. Custom button mappings
  state.customButtons.forEach(cb => {
    mappings[cb.id] = cb.key;
  });

  sendJson({
    type: 'update_mappings',
    mappings
  });
}

// ================= Swipe Gesture & Combo Engine =================
function updateHUDButtonLabels() {
  ['pass', 'shoot', 'through', 'def'].forEach(btnAction => {
    const btn = document.getElementById(`btn-action-${btnAction}`);
    const wrap = document.getElementById(`wrap-action-${btnAction}`);
    const cfg = state.gestures[btnAction];
    if (!btn || !cfg) return;

    const baseKey = cfg.baseKey || btnAction;
    btn.setAttribute('data-key', baseKey);

    const name = cfg.name || btnAction.toUpperCase();
    if (wrap) wrap.setAttribute('data-btn-name', name);

    const atkSpan = btn.querySelector('.hud-btn-atk');
    const slashSpan = btn.querySelector('.hud-btn-slash');
    const subSpan = btn.querySelector('.hud-btn-sub');

    if (name.includes('/')) {
      const parts = name.split('/');
      const atk = parts[0].trim();
      const slash = '/ ' + parts.slice(1).join('/').trim();
      if (atkSpan) atkSpan.textContent = atk;
      if (slashSpan) slashSpan.textContent = slash;
    } else {
      if (atkSpan) atkSpan.textContent = name;
      if (slashSpan) slashSpan.textContent = '';
    }

    if (subSpan) {
      subSpan.textContent = `[${baseKey.toUpperCase()}]`;
    }
  });
}

function updateGestureTabsLabels() {
  if (!elements.gestureTabs) return;
  elements.gestureTabs.querySelectorAll('.g-tab-btn').forEach(tab => {
    const btnAction = tab.getAttribute('data-btn');
    const cfg = state.gestures[btnAction];
    if (cfg) {
      const shortName = (cfg.name || btnAction).split('/')[0].trim();
      tab.textContent = `${shortName} [${(cfg.baseKey || '').toUpperCase()}]`;
    }
  });
}

function getActiveLayoutData() {
  const positions = {};
  document.querySelectorAll('.hud-btn-wrap').forEach(wrap => {
    if (wrap.id) {
      const customScale = wrap.style.getPropertyValue('--btn-custom-scale');
      positions[wrap.id] = {
        left: wrap.style.left || '',
        top: wrap.style.top || '',
        scale: customScale ? parseFloat(customScale) : null
      };
    }
  });

  return {
    btnScale: state.hudBtnScale || 1.0,
    btnOpacity: state.hudBtnOpacity || 0.95,
    positions
  };
}

function initGesturesModal() {
  if (elements.btnOpenGestures) {
    elements.btnOpenGestures.addEventListener('click', openGesturesModal);
  }
  if (elements.btnCloseGestures) {
    elements.btnCloseGestures.addEventListener('click', closeGesturesModal);
  }
  if (elements.btnSaveGestures) {
    elements.btnSaveGestures.addEventListener('click', () => {
      saveGesturesFromUI();
      closeGesturesModal();
    });
  }
  if (elements.btnResetGestures) {
    elements.btnResetGestures.addEventListener('click', () => {
      state.gestures = JSON.parse(JSON.stringify(DEFAULT_GESTURES));
      renderGestureSlots(state.activeGestureBtnTab);
      saveGestures();
      updateHUDButtonLabels();
      updateGestureTabsLabels();
      triggerHaptic(20);
      addLogEntry("Reset all buttons & gestures to default bindings", "info");
    });
  }

  // Button Tabs (PASS, SHOOT, THROUGH, DEF)
  if (elements.gestureTabs) {
    elements.gestureTabs.querySelectorAll('.g-tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        elements.gestureTabs.querySelectorAll('.g-tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const btnKey = tab.getAttribute('data-btn');
        state.activeGestureBtnTab = btnKey;
        renderGestureSlots(btnKey);
      });
    });
  }

  // Swipe Buffer Window Slider
  if (elements.sliderSwipeBuffer) {
    elements.sliderSwipeBuffer.value = state.swipeBufferMs || 70;
    if (elements.badgeSwipeBufferVal) {
      elements.badgeSwipeBufferVal.textContent = `${state.swipeBufferMs || 70}ms`;
    }
    elements.sliderSwipeBuffer.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.swipeBufferMs = val;
      if (elements.badgeSwipeBufferVal) {
        elements.badgeSwipeBufferVal.textContent = `${val}ms`;
      }
    });
  }
}

function openGesturesModal() {
  if (!elements.gesturesModal) return;
  elements.gesturesModal.classList.remove('hidden');
  renderGestureSlots(state.activeGestureBtnTab || 'pass');
  if (elements.sliderSwipeBuffer) {
    elements.sliderSwipeBuffer.value = state.swipeBufferMs || 70;
  }
  if (elements.badgeSwipeBufferVal) {
    elements.badgeSwipeBufferVal.textContent = `${state.swipeBufferMs || 70}ms`;
  }
  triggerHaptic(15);
}

function closeGesturesModal() {
  if (!elements.gesturesModal) return;
  elements.gesturesModal.classList.add('hidden');
}

function renderGestureSlots(btnAction) {
  const container = elements.gestureSlotsList;
  if (!container) return;
  container.innerHTML = '';

  const cfg = state.gestures[btnAction];
  if (!cfg) return;

  // 1. Base Button Identity Card (Display Name & Single Tap Key)
  const baseCard = document.createElement('div');
  baseCard.className = 'base-btn-config-card';
  baseCard.innerHTML = `
    <div class="config-card-header">
      <span class="config-badge">BUTTON IDENTITY</span>
      <span class="config-title">Single Tap Key & Display Name</span>
    </div>
    <div class="config-card-body">
      <div class="config-field">
        <label for="input-btn-name">Display Name (Text shown on button, e.g. PASS / MATCH-UP or SPRINT):</label>
        <input type="text" id="input-btn-name" class="slot-text-input" value="${escapeHtml(cfg.name || btnAction.toUpperCase())}" placeholder="e.g. PASS / MATCH-UP">
      </div>
      <div class="config-field">
        <label for="input-btn-basekey">Single Tap Key / Combo (Fires on tap or sustained hold):</label>
        <div class="input-with-presets">
          <input type="text" id="input-btn-basekey" class="slot-key-input" style="flex:1;" value="${escapeHtml(cfg.baseKey || '')}" placeholder="e.g. s, d, w, q, space" spellcheck="false">
          <div class="quick-presets">
            <button class="preset-chip base-preset-chip" type="button" data-val="s">S</button>
            <button class="preset-chip base-preset-chip" type="button" data-val="d">D</button>
            <button class="preset-chip base-preset-chip" type="button" data-val="w">W</button>
            <button class="preset-chip base-preset-chip" type="button" data-val="q">Q</button>
            <button class="preset-chip base-preset-chip" type="button" data-val="space">SPACE</button>
            <button class="preset-chip base-preset-chip" type="button" data-val="lshift">LSHIFT</button>
            <button class="preset-chip base-preset-chip" type="button" data-val="e">E</button>
            <button class="preset-chip base-preset-chip" type="button" data-val="c">C</button>
          </div>
        </div>
      </div>
    </div>
  `;

  baseCard.querySelectorAll('.base-preset-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const input = baseCard.querySelector('#input-btn-basekey');
      if (input) {
        input.value = chip.getAttribute('data-val');
        triggerHaptic(10);
      }
    });
  });

  container.appendChild(baseCard);

  // Section divider for directional swipes
  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'gesture-section-title';
  sectionTitle.textContent = '4-Way Directional Swipes';
  container.appendChild(sectionTitle);

  // 2. 4 Directions with SIMPLE descriptions
  const directions = [
    { dir: 'up', arrow: '▲', name: 'Swipe UP' },
    { dir: 'down', arrow: '▼', name: 'Swipe DOWN' },
    { dir: 'left', arrow: '◀', name: 'Swipe LEFT' },
    { dir: 'right', arrow: '▶', name: 'Swipe RIGHT' }
  ];

  directions.forEach(({ dir, arrow, name }) => {
    const dirData = cfg[dir] || { key: '', presets: [] };
    const row = document.createElement('div');
    row.className = 'gesture-slot-row';

    const defaultPresets = ['space', 'lshift', 'e', 'c', 'w', 's', 'a', 'd'];
    const presetsHtml = (dirData.presets && dirData.presets.length > 0 ? dirData.presets : defaultPresets)
      .map(p => `<button class="preset-chip" type="button" data-val="${p}">${p.toUpperCase()}</button>`)
      .join('');

    row.innerHTML = `
      <div class="slot-info">
        <span class="slot-arrow">${arrow}</span>
        <div>
          <div class="slot-label">${name}</div>
          <div class="slot-sub">Swipe ${name.split(' ')[1]} Command</div>
        </div>
      </div>
      <div class="slot-inputs">
        <input type="text" class="slot-key-input" id="input-g-${btnAction}-${dir}" value="${dirData.key || ''}" spellcheck="false" placeholder="key/combo">
        <div class="quick-presets">
          ${presetsHtml}
        </div>
      </div>
    `;

    row.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const input = row.querySelector('.slot-key-input');
        if (input) {
          input.value = chip.getAttribute('data-val');
          triggerHaptic(10);
        }
      });
    });

    container.appendChild(row);
  });
}

function saveGesturesFromUI() {
  const btnAction = state.activeGestureBtnTab;
  const cfg = state.gestures[btnAction];
  if (cfg) {
    const nameInput = document.getElementById('input-btn-name');
    if (nameInput) {
      cfg.name = nameInput.value.trim() || btnAction.toUpperCase();
    }
    const baseKeyInput = document.getElementById('input-btn-basekey');
    if (baseKeyInput) {
      cfg.baseKey = baseKeyInput.value.trim().toLowerCase() || btnAction;
    }

    ['up', 'down', 'left', 'right'].forEach(dir => {
      const input = document.getElementById(`input-g-${btnAction}-${dir}`);
      if (input && cfg[dir]) {
        cfg[dir].key = input.value.trim().toLowerCase();
      }
    });
  }

  updateHUDButtonLabels();
  updateGestureTabsLabels();
  saveGestures();
  saveActiveProfileState();
  triggerHaptic(20);
}

function saveGestures() {
  try {
    localStorage.setItem('efootball_swipe_gestures', JSON.stringify(state.gestures));
    localStorage.setItem('efootball_swipe_buffer', state.swipeBufferMs || 70);
    syncAllMappingsToServer();
    addLogEntry("Button bindings & swipe combos synchronized!", "press");
  } catch (e) {
    console.warn("Gesture save notice:", e);
  }
}

function loadSavedGestures() {
  state.gestures = JSON.parse(JSON.stringify(DEFAULT_GESTURES));
  const raw = localStorage.getItem('efootball_swipe_gestures');
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      delete saved.cross; // Purge legacy 'cross' entry
      for (const btn in saved) {
        if (state.gestures[btn]) {
          state.gestures[btn] = { ...state.gestures[btn], ...saved[btn] };
        }
      }
    } catch (e) {
      console.warn("Could not parse saved gestures:", e);
    }
  }

  const savedBuffer = localStorage.getItem('efootball_swipe_buffer');
  if (savedBuffer) {
    state.swipeBufferMs = parseInt(savedBuffer, 10) || 70;
  }
}

// ================= Game Profiles System (Export, Import, Switch, Create) =================
function initProfilesSystem() {
  loadAllProfilesFromStorage();

  if (elements.btnOpenProfiles) {
    elements.btnOpenProfiles.addEventListener('click', openProfilesModal);
  }
  if (elements.btnCloseProfiles) {
    elements.btnCloseProfiles.addEventListener('click', closeProfilesModal);
  }
  if (elements.btnDoneProfiles) {
    elements.btnDoneProfiles.addEventListener('click', closeProfilesModal);
  }

  if (elements.selectProfileChoice) {
    elements.selectProfileChoice.addEventListener('change', (e) => {
      const newProfileName = e.target.value;
      if (newProfileName && newProfileName !== state.currentProfile) {
        switchProfile(newProfileName);
      }
    });
  }

  if (elements.btnNewProfile) {
    elements.btnNewProfile.addEventListener('click', createNewProfile);
  }
  if (elements.btnRenameProfile) {
    elements.btnRenameProfile.addEventListener('click', renameCurrentProfile);
  }
  if (elements.btnDeleteProfile) {
    elements.btnDeleteProfile.addEventListener('click', deleteCurrentProfile);
  }

  // File Export
  if (elements.btnExportProfile) {
    elements.btnExportProfile.addEventListener('click', exportActiveProfile);
  }

  // File Import Trigger & Handler
  if (elements.btnImportProfileTrigger && elements.inputImportProfileFile) {
    elements.btnImportProfileTrigger.addEventListener('click', () => {
      elements.inputImportProfileFile.click();
    });

    elements.inputImportProfileFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        importProfileFromFile(file);
        e.target.value = ''; // Reset file input so same file can be re-selected if desired
      }
    });
  }
}

function openProfilesModal() {
  if (!elements.modalProfiles) return;
  saveActiveProfileState(); // Ensure current edits are saved
  populateProfileDropdown();
  renderProfileSummary();
  elements.modalProfiles.classList.remove('hidden');
  triggerHaptic(15);
}

function closeProfilesModal() {
  if (!elements.modalProfiles) return;
  elements.modalProfiles.classList.add('hidden');
}

function saveActiveProfileState() {
  if (!state.currentProfile) state.currentProfile = 'eFootball';
  if (!state.profiles) state.profiles = {};

  state.profiles[state.currentProfile] = {
    name: state.currentProfile,
    gestures: JSON.parse(JSON.stringify(state.gestures)),
    customButtons: JSON.parse(JSON.stringify(state.customButtons || [])),
    layout: getActiveLayoutData(),
    swipeBufferMs: state.swipeBufferMs || 70,
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem('efootball_game_profiles', JSON.stringify(state.profiles));
    localStorage.setItem('efootball_active_profile', state.currentProfile);
  } catch (e) {
    console.warn("Profile storage save error:", e);
  }
}

function loadAllProfilesFromStorage() {
  let loadedProfiles = null;
  const raw = localStorage.getItem('efootball_game_profiles');
  if (raw) {
    try {
      loadedProfiles = JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to parse saved game profiles:", e);
    }
  }

  // Create default profiles if storage is empty
  if (!loadedProfiles || typeof loadedProfiles !== 'object' || Object.keys(loadedProfiles).length === 0) {
    loadedProfiles = {
      'eFootball': {
        name: 'eFootball',
        gestures: JSON.parse(JSON.stringify(DEFAULT_GESTURES)),
        customButtons: JSON.parse(JSON.stringify(state.customButtons || [])),
        layout: getActiveLayoutData(),
        swipeBufferMs: 70
      },
      'FIFA / EA FC': {
        name: 'FIFA / EA FC',
        gestures: {
          pass: { name: "GROUND PASS", baseKey: "s", up: { key: "a", presets: ["a", "w"] }, down: { key: "s", presets: ["s", "c+s"] }, left: { key: "a", presets: ["a"] }, right: { key: "e+s", presets: ["e+s"] } },
          shoot: { name: "SHOOT / VOLLEY", baseKey: "d", up: { key: "w+d", presets: ["w+d", "q+d"] }, down: { key: "c+d", presets: ["c+d", "z+d"] }, left: { key: "a+d", presets: ["a+d"] }, right: { key: "e+d", presets: ["e+d"] } },
          through: { name: "THROUGH BALL", baseKey: "w", up: { key: "lshift+w", presets: ["lshift+w"] }, down: { key: "w", presets: ["w"] }, left: { key: "a+w", presets: ["a+w"] }, right: { key: "e+w", presets: ["e+w"] } },
          def: { name: "SPRINT / TACKLE", baseKey: "e", right: { key: "e", presets: ["e"] }, left: { key: "s", presets: ["s"] }, up: { key: "d", presets: ["d"] }, down: { key: "a", presets: ["a"] } }
        },
        customButtons: [],
        layout: getActiveLayoutData(),
        swipeBufferMs: 70
      }
    };
  }

  // Purge any legacy 'cross' action if lingering in profiles
  for (const pName in loadedProfiles) {
    if (loadedProfiles[pName].gestures && loadedProfiles[pName].gestures.cross) {
      delete loadedProfiles[pName].gestures.cross;
    }
  }

  state.profiles = loadedProfiles;

  const savedActive = localStorage.getItem('efootball_active_profile');
  if (savedActive && state.profiles[savedActive]) {
    state.currentProfile = savedActive;
  } else {
    state.currentProfile = Object.keys(state.profiles)[0] || 'eFootball';
  }

  // Apply active profile snapshot
  applyProfileSnapshot(state.profiles[state.currentProfile]);
}

function populateProfileDropdown() {
  if (!elements.selectProfileChoice) return;
  elements.selectProfileChoice.innerHTML = '';

  for (const name of Object.keys(state.profiles)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === state.currentProfile) {
      opt.selected = true;
    }
    elements.selectProfileChoice.appendChild(opt);
  }
}

function renderProfileSummary() {
  if (!elements.profileSummaryDetails) return;
  const p = state.profiles[state.currentProfile];
  if (!p) {
    elements.profileSummaryDetails.innerHTML = '<span>No profile selected</span>';
    return;
  }

  let html = `<div style="margin-bottom:8px;"><strong>Profile:</strong> <span style="color:var(--accent-cyan); font-weight:700;">${escapeHtml(p.name)}</span></div>`;
  html += `<div style="margin-bottom:6px; font-weight:700; color:var(--text-muted); font-size:11px;">MAIN BUTTONS & SINGLE TAP KEYS:</div>`;
  html += '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">';

  if (p.gestures) {
    ['pass', 'shoot', 'through', 'def'].forEach(k => {
      const g = p.gestures[k];
      if (g) {
        const name = (g.name || k).split('/')[0].trim();
        const key = (g.baseKey || k).toUpperCase();
        html += `<span class="summary-badge-item">${escapeHtml(name)}: <strong>[${escapeHtml(key)}]</strong></span>`;
      }
    });
  }
  html += '</div>';

  const customCount = (p.customButtons && p.customButtons.length) || 0;
  html += `<div style="font-size:11px; color:var(--text-muted);">Custom Added Buttons: <strong style="color:#fff;">${customCount}</strong> | Swipe Recognition Buffer: <strong style="color:var(--accent-cyan);">${p.swipeBufferMs || 70}ms</strong></div>`;

  elements.profileSummaryDetails.innerHTML = html;
}

function applyProfileSnapshot(profile) {
  if (!profile) return;

  // 1. Restore Gestures
  if (profile.gestures) {
    state.gestures = JSON.parse(JSON.stringify(profile.gestures));
  } else {
    state.gestures = JSON.parse(JSON.stringify(DEFAULT_GESTURES));
  }

  // 2. Restore Swipe Buffer
  state.swipeBufferMs = profile.swipeBufferMs || 70;
  if (elements.sliderSwipeBuffer) elements.sliderSwipeBuffer.value = state.swipeBufferMs;
  if (elements.badgeSwipeBufferVal) elements.badgeSwipeBufferVal.textContent = `${state.swipeBufferMs}ms`;

  // 3. Restore Custom Buttons
  state.customButtons = Array.isArray(profile.customButtons) ? JSON.parse(JSON.stringify(profile.customButtons)) : [];
  // Clean up any DOM custom buttons
  document.querySelectorAll('.custom-btn-wrap').forEach(el => el.remove());
  const cluster = document.getElementById('action-cluster') || document.getElementById('action-zone');
  if (cluster) {
    state.customButtons.forEach(btnData => {
      const el = createCustomButtonElement(btnData);
      cluster.appendChild(el);
    });
  }
  saveCustomButtons();

  // 4. Restore Layout
  if (profile.layout) {
    const layout = profile.layout;
    if (layout.btnScale) {
      state.hudBtnScale = layout.btnScale;
      document.documentElement.style.setProperty('--hud-btn-scale', layout.btnScale);
      if (elements.sliderBtnSize) elements.sliderBtnSize.value = layout.btnScale;
    }
    if (layout.btnOpacity) {
      state.hudBtnOpacity = layout.btnOpacity;
      document.documentElement.style.setProperty('--hud-btn-opacity', layout.btnOpacity);
      if (elements.sliderBtnOpacity) elements.sliderBtnOpacity.value = layout.btnOpacity;
    }
    if (layout.positions) {
      for (const [id, pos] of Object.entries(layout.positions)) {
        const el = document.getElementById(id);
        if (el) {
          if (pos.left && pos.top) {
            el.style.left = pos.left;
            el.style.top = pos.top;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.transform = 'none';
          }
          if (pos.scale) {
            el.style.setProperty('--btn-custom-scale', pos.scale);
          }
        }
      }
    }
  }

  // 5. Update UI Labels
  updateHUDButtonLabels();
  updateGestureTabsLabels();
  if (elements.gesturesModal && !elements.gesturesModal.classList.contains('hidden')) {
    renderGestureSlots(state.activeGestureBtnTab || 'pass');
  }

  // 6. Synchronize Server
  syncAllMappingsToServer();
}

function switchProfile(newProfileName) {
  if (!state.profiles[newProfileName]) return;
  saveActiveProfileState(); // Save current profile before switching
  state.currentProfile = newProfileName;
  localStorage.setItem('efootball_active_profile', newProfileName);

  applyProfileSnapshot(state.profiles[newProfileName]);
  populateProfileDropdown();
  renderProfileSummary();

  triggerHaptic(25);
  addLogEntry(`Switched active profile to: "${newProfileName}"`, "press");
}

function createNewProfile() {
  const profileName = prompt("Enter a name for the new game profile:", "My Game Profile");
  if (!profileName || !profileName.trim()) return;

  const cleanName = profileName.trim();
  if (state.profiles[cleanName]) {
    alert(`A profile named "${cleanName}" already exists. Please choose a different name.`);
    return;
  }

  saveActiveProfileState();

  // Create clone of current setup
  state.profiles[cleanName] = {
    name: cleanName,
    gestures: JSON.parse(JSON.stringify(state.gestures)),
    customButtons: JSON.parse(JSON.stringify(state.customButtons || [])),
    layout: getActiveLayoutData(),
    swipeBufferMs: state.swipeBufferMs || 70,
    createdAt: new Date().toISOString()
  };

  state.currentProfile = cleanName;
  saveActiveProfileState();

  populateProfileDropdown();
  renderProfileSummary();
  triggerHaptic(30);
  addLogEntry(`Created and activated new profile: "${cleanName}"`, "press");
}

function renameCurrentProfile() {
  const oldName = state.currentProfile;
  const newName = prompt(`Rename profile "${oldName}" to:`, oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;

  const cleanName = newName.trim();
  if (state.profiles[cleanName]) {
    alert(`A profile named "${cleanName}" already exists.`);
    return;
  }

  const profileData = state.profiles[oldName];
  profileData.name = cleanName;
  delete state.profiles[oldName];
  state.profiles[cleanName] = profileData;
  state.currentProfile = cleanName;

  saveActiveProfileState();
  populateProfileDropdown();
  renderProfileSummary();
  triggerHaptic(20);
  addLogEntry(`Renamed profile "${oldName}" to "${cleanName}"`, "info");
}

function deleteCurrentProfile() {
  const profileKeys = Object.keys(state.profiles);
  if (profileKeys.length <= 1) {
    alert("You cannot delete the only remaining profile!");
    return;
  }

  const doomedName = state.currentProfile;
  if (!confirm(`Are you sure you want to delete profile "${doomedName}"?`)) return;

  delete state.profiles[doomedName];
  const remainingKeys = Object.keys(state.profiles);
  state.currentProfile = remainingKeys[0];

  applyProfileSnapshot(state.profiles[state.currentProfile]);
  saveActiveProfileState();
  populateProfileDropdown();
  renderProfileSummary();

  triggerHaptic(25);
  addLogEntry(`Deleted profile "${doomedName}". Active profile is now "${state.currentProfile}".`, "release");
}

function exportActiveProfile() {
  saveActiveProfileState();
  const current = state.profiles[state.currentProfile];
  if (!current) return;

  const exportPayload = {
    antigravityFormat: 'game_controller_profile',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: current
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safeFileName = current.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName}_controller_profile.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  triggerHaptic(25);
  addLogEntry(`Exported profile file: "${safeFileName}_controller_profile.json"`, "press");
}

function importProfileFromFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      let importedProfile = null;

      if (parsed.antigravityFormat === 'game_controller_profile' && parsed.profile) {
        importedProfile = parsed.profile;
      } else if (parsed.gestures) {
        importedProfile = parsed;
      } else {
        alert("Invalid controller profile format! File must contain gestures or game profile data.");
        return;
      }

      let profileName = (importedProfile.name || file.name.replace(/\.[^/.]+$/, "")).trim();
      if (!profileName) profileName = "Imported Profile";

      // If name collides, offer to overwrite or rename
      if (state.profiles[profileName]) {
        const overwrite = confirm(`A profile named "${profileName}" already exists.\nClick OK to overwrite it, or Cancel to import as a copy.`);
        if (!overwrite) {
          profileName = `${profileName} (Imported)`;
        }
      }

      importedProfile.name = profileName;
      // Clean legacy cross
      if (importedProfile.gestures && importedProfile.gestures.cross) {
        delete importedProfile.gestures.cross;
      }

      state.profiles[profileName] = importedProfile;
      state.currentProfile = profileName;

      applyProfileSnapshot(importedProfile);
      saveActiveProfileState();
      populateProfileDropdown();
      renderProfileSummary();

      triggerHaptic(35);
      addLogEntry(`Successfully imported & activated profile: "${profileName}"!`, "press");
      alert(`Profile "${profileName}" imported successfully!`);
    } catch (err) {
      console.error("Failed to parse imported file:", err);
      alert(`Could not import profile: ${err.message}`);
    }
  };

  reader.onerror = () => {
    alert("Error reading file.");
  };

  reader.readAsText(file);
}

// Start application
window.addEventListener('DOMContentLoaded', init);

