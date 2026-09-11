# TYRETRACE — Blender Digital Twin Live Integration (Phase 11)

This directory contains the integration bridge between the **TYRETRACE Real-Time Intelligence Backend** and the high-fidelity **Blender 3D Race Car Digital Twin**.

---

## 1. Overview & Architecture

TYRETRACE synchronizes telemetry and tyre intelligence across both the web command center (React/Three.js) and a photorealistic 3D digital twin in Blender:

```
                  TYRETRACE FASTAPI GATEWAY
                    (http://localhost:8000)
                             |
                     /ws/telemetry (20 Hz)
                             |
              +--------------+--------------+
              |                             |
              v                             v
       REACT COMMAND CENTER        BLENDER DIGITAL TWIN
         (Three.js View)         (tyretrace_live_bridge.py)
              |                             |
      Chassis HUD & Graphs          Wheel Rotation (local Z)
      Tyre Selection (FL/FR...)  <---> Selection Highlighting
      Global TDI & Confounders      Camera Tracking (CAM_Wheel_FL_Close)
      REPLAY vs DEMO_SIMULATION     HUD Text Overlay (TYRETRACE_HUD)
```

The Blender bridge runs directly inside Blender using a non-blocking, thread-safe architecture:
- **Networking Thread:** Manages persistent WebSocket connection to `ws://localhost:8000/ws/telemetry` with auto-reconnect backoff.
- **Thread-Safe Queue:** Pushes validated `TyreTraceFrame` instances into a bounded FIFO queue.
- **Blender Main Thread (`bpy.app.timers`):** Polls the queue at 40 Hz (every 25 ms) and applies scene updates safely without freezing the Blender interface.

---

## 2. Prerequisites

1. **Blender:** Blender 4.x / 5.x / 6.x installed (e.g. `/Applications/Blender.app`).
2. **Python `websockets` Library in Blender:**
   If not already installed in Blender's Python, open Terminal and run:
   ```bash
   /Applications/Blender.app/Contents/MacOS/Blender -b --python-expr "import sys, subprocess; subprocess.run([sys.executable, '-m', 'pip', 'install', 'websockets'])"
   ```
   *(Note: If `websockets` is absent, the bridge automatically falls back to HTTP polling of `/api/telemetry` and `/api/tdi` without crashing).*
3. **TYRETRACE Backend Running:** Port `8000`.
4. **TYRETRACE Frontend Running:** Port `5173`.

---

## 3. Launching the Live Bridge

### Step 1: Start the Backend & Frontend
Terminal 1:
```bash
cd /Users/aryanchauhan/Developer/tyre-degradation-intelligence
.venv/bin/uvicorn backend.api.app:app --host 0.0.0.0 --port 8000
```

Terminal 2:
```bash
cd /Users/aryanchauhan/Developer/tyre-degradation-intelligence/frontend
npm run dev
```

### Step 2: Open Blender & Run the Bridge
**Option A: Through the Blender GUI**
1. Launch Blender.
2. Open `blender/Formula_2_Car_DigitalTwin_V7_Mechanical_Thermal.blend`.
3. Switch to the **Scripting** workspace (top header tab).
4. Open `blender/tyretrace_live_bridge.py`.
5. Click **Run Script** (or press `Alt + P`).
6. Switch back to the **Layout** or **3D Viewport** workspace.
7. Press `N` to open the Sidebar panel and click the **TYRETRACE** tab.
8. Click **[ Connect ]**. The status updates to **● CONNECTED**.

**Option B: One-Command Headless / GUI Launch**
```bash
/Applications/Blender.app/Contents/MacOS/Blender blender/Formula_2_Car_DigitalTwin_V7_Mechanical_Thermal.blend --python blender/tyretrace_live_bridge.py
```

---

## 4. Blender Controls & Features

### 1. Wheel Rotation Dynamics
- **Speed-Coupled:** Vehicle forward velocity ($v$ in m/s) drives wheel angular velocity ($\omega = v / R_{\text{wheel}}$, where $R_{\text{wheel}} = 0.5975\text{ m}$).
- **Axis Orientation:** Wheels rotate around their verified local axle (`rotation_euler.z`).
  - Left wheels (`Wheel_FL`, `Wheel_RL`): $d\theta = -\omega \cdot \Delta t$
  - Right wheels (`Wheel_FR`, `Wheel_RR`): $d\theta = +\omega \cdot \Delta t$
- **Non-Destructive:** Uses Blender object rotation transforms only; base vertex geometries are untouched.

### 2. Tyre Selection Synchronization
- Clicking a tyre on the React dashboard (e.g. Front-Right `FR`) sends an active component sync (`Wheel_FR`) to Blender.
- **Visual Highlight:** The selected tyre receives an engineering emission tint (`#00F0FF`, strength 2.5) on `Tyre_{CORNER}_Center`.
- **Deselection Restoration:** When deselected, materials cleanly revert to their original baseline cached state without permanent file changes.
- **Manual Wheel Selection:** The Sidebar UI panel includes quick selection buttons (`FL`, `FR`, `RL`, `RR`).

### 3. Camera Alignment
- When `FL` is selected: Blender automatically switches the active scene camera to `CAM_Wheel_FL_Close`.
- When deselected or clicking **[ Reset Cam ]**: Camera returns to the global vehicle `Camera` view.

### 4. Mode Separation: REAL_REPLAY vs DEMO_SIMULATION
- **`REAL_REPLAY` (Default):**
  - FastF1 does not provide 4-wheel thermal arrays or tread depth sensors.
  - Corner TDI status displays strictly as `UNAVAILABLE` (`tdi = null`).
  - Tyres maintain a standard neutral racing appearance; zero fake wear or fake temperatures are visualized.
- **`DEMO_SIMULATION`:**
  - Activated by clicking **[ DEMO SIMULATION ]** in the top bar or via API (`POST /api/mode`).
  - Corner TDI values supplied by the backend are visualized dynamically:
    - **< 25%:** Healthy (subtle green tint)
    - **25–50%:** Moderate (amber tint)
    - **50–75%:** High (orange tint)
    - **75–100%:** Critical (crimson red tint)
  - Switching back to `REAL_REPLAY` immediately restores tyres to neutral.

### 5. 3D Engineering HUD Overlay
- A dynamic 3D text object (`TYRETRACE_HUD`) floats in the 3D scene displaying:
  ```
  TYRETRACE | REPLAY
  TDI: 5.7 (HEALTHY_LOW_EVIDENCE) | CONF: 85%
  SPD: 312 km/h | GEAR: 8 | DRS: ACTIVE
  LAP: 12 | SEQ: #245
  ```

---

## 5. Troubleshooting & Diagnostics

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **Status: ○ DISCONNECTED** | FastAPI backend is not running on `localhost:8000`. | Start the backend using `.venv/bin/uvicorn backend.api.app:app --host 0.0.0.0 --port 8000`. |
| **`ModuleNotFoundError: No module named 'websockets'`** | Blender's embedded Python lacks the package. | Run the pip install command from Section 2, or rely on the built-in HTTP fallback. |
| **Wheels do not spin during replay** | Replay is paused or car speed is 0 km/h. | Click **Play** on the React dashboard or call `POST /api/replay/resume`. |
| **Materials appear altered after demo** | Script was interrupted before reset. | Click **[ Reset Cam ]** or call `_BRIDGE_INSTANCE.scene_mgr.reset_all()`. |

---

## 6. Automated Testing

Run the 11 Blender integration tests using pytest:
```bash
PYTHONPATH=. .venv/bin/pytest tests/test_blender_integration.py
```
This tests payload parsing, mode isolation, missing TDI handling, wheel mapping, reconnect resilience, and executes a real headless scene test inside Blender.
