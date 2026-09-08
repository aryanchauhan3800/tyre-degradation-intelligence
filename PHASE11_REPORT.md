# PHASE 11 REPORT — CONNECT EXISTING BLENDER DIGITAL TWIN TO TYRETRACE DASHBOARD
**Project:** TYRETRACE — Physics-Informed Tyre Degradation Intelligence  
**Phase:** 11 — Blender Digital Twin Live Integration  
**Status:** COMPLETE  
**Date:** March 2025 / September 2026  
**Artifact Version:** 1.1.0-phase11-blender-connected  

---

## 1. Executive Summary

Phase 11 has successfully connected the high-fidelity, existing 3D race car digital twin (`Formula_2_Car_DigitalTwin_V7_Mechanical_Thermal.blend`) to the live TYRETRACE backend API and React telemetry command center.

Key accomplishments:
- **Zero Geometry Modifications:** The existing Blender car model (`Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR` and all suspension/brake sub-assemblies) remains completely unaltered.
- **Unified Single Source of Truth:** Blender receives the exact same 20 Hz WebSocket stream (`ws://localhost:8000/ws/telemetry`) that drives the React command center.
- **Thread-Safe Architecture:** Background network ingestion feeds a thread-safe FIFO queue, while scene transformations, material highlights, and camera actions are executed strictly on the Blender main thread via `bpy.app.timers` at 40 Hz (25 ms interval).
- **Verified Wheel Roll Physics:** Wheel rotation axes were verified through local geometric inspection on the `.blend` mesh. Rolling velocity is coupled to instantaneous vehicle speed ($v$ in m/s) on the local $Z$ Euler rotation axis.
- **Bidirectional Tyre Selection Synchronization:** When an engineer selects a tyre corner on the React dashboard or 3D canvas (e.g. `FR`), the selection immediately synchronizes to Blender, highlighting `Wheel_FR` with an engineering cyan emission glow without permanently mutating the `.blend` file materials.
- **Strict Scientific Integrity:** In `REAL_REPLAY` mode, four-wheel corner wear remains strictly `UNAVAILABLE` (`tdi = null`), preventing fabrication of unmeasured FastF1 physical parameters. In `DEMO_SIMULATION` mode, backend-provided simulated degradation tiers (<25% green, 25–50% amber, 50–75% orange, 75–100% red) are visualized dynamically.
- **Test Suite Growth:** 11 new integration tests added in `tests/test_blender_integration.py` (including real headless Blender execution), expanding the automated backend suite from 128 to **139 passing tests**. All 20 frontend tests and production TypeScript builds continue to pass cleanly.

---

## 2. End-to-End Synchronization Architecture

```
                               FASTF1 TELEMETRY REPLAY
                                         |
                                         v
                         TYRETRACE UNIFIED PIPELINE (FASTAPI)
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
             REST API (/api/*)                 WEBSOCKET GATEWAY (/ws/telemetry)
             - Health, Session, Laps            - Real-Time Push Stream (20 Hz)
             - Component Select (/api/component/select) - Bidirectional Client Messages
             - Mode Switch (/api/mode)                   - Low-Latency JSON (0.077 ms)
                       |                                   |
                       |                  +----------------+----------------+
                       |                  |                                 |
                       v                  v                                 v
               REACT COMMAND CENTER (PORT 5173)              BLENDER 3D DIGITAL TWIN
               - Telemetry HUD & Track Map                    (Formula_2_Car.blend)
               - Three.js Interactive Car Canvas              - Background Network Client
               - Global TDI Gauge & Trajectory                - Thread-Safe Frame Queue
               - Why/Explainability & Confounders             - Main Thread Timer (40 Hz)
               - Replay Controls & Mode Toggle                - Speed-Coupled Wheel Rotation
               - Corner Tyre Selection (FL/FR/RL/RR) <------> - Selected Tyre Cyan Highlight
                                                              - Close-Up Camera Alignment
                                                              - 3D Text HUD Overlay
```

---

## 3. Blender Connection Method & Network Engine

The Blender bridge script is located at [`blender/tyretrace_live_bridge.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/blender/tyretrace_live_bridge.py).

### Dual-Protocol Ingestion:
1. **Primary Protocol (Asyncio WebSocket):**
   Connects to `ws://localhost:8000/ws/telemetry` using the high-performance Python `websockets` package (installed into Blender's user site-packages). Supports bidirectional communication (client ping-pong, tyre selection commands, mode switches).
2. **Fallback Protocol (HTTP Polling):**
   If third-party packages are unavailable in an isolated Blender environment, the engine gracefully falls back to non-blocking polling of `/api/telemetry` and `/api/tdi` using Python's standard `urllib.request` without crashing or freezing Blender.

### Main-Thread Execution Safety:
Blender's Python API (`bpy`) is strictly single-threaded. Calling `bpy` operations from network threads causes memory corruption or segmentation faults. TYRETRACE resolves this with a decoupled queue architecture:
- **Network Thread:** Ingests raw JSON frames $\to$ parses and validates fields $\to$ enqueues into `queue.Queue(maxsize=5)`. Stale frames are discarded if the queue fills, ensuring zero latency drift.
- **Main Thread (`bpy.app.timers`):** A persistent timer callback runs every 0.025 seconds (40 Hz), pulling the latest frame from the queue and safely executing scene updates.

---

## 4. Wheel Mapping & Rotation Physics

Inspection of `Formula_2_Car_DigitalTwin_V7_Mechanical_Thermal.blend` revealed the exact wheel layout:
- `Wheel_FL` (Mesh, Front-Left): $X \approx +2.47\text{ m}$, $Y \approx +1.39\text{ m}$, $Z \approx +0.59\text{ m}$
- `Wheel_FR` (Mesh, Front-Right): $X \approx +2.47\text{ m}$, $Y \approx -1.39\text{ m}$, $Z \approx +0.59\text{ m}$
- `Wheel_RL` (Mesh, Rear-Left): $X \approx -3.10\text{ m}$, $Y \approx +1.39\text{ m}$, $Z \approx +0.59\text{ m}$
- `Wheel_RR` (Mesh, Rear-Right): $X \approx -3.10\text{ m}$, $Y \approx -1.39\text{ m}$, $Z \approx +0.59\text{ m}$

### Kinematic Wheel Roll Formulation:
Wheel meshes have bounding radius $R_{\text{wheel}} = 0.5975\text{ m}$ with local axis along local $Z$ (`rotation_euler.z`):
$$\omega = \frac{v_{\text{mps}}}{R_{\text{wheel}}} \quad [\text{rad/s}], \qquad \Delta \theta = \omega \cdot \Delta t \quad [\text{rad}]$$

Experimental inspection of vertex displacements verified the rotational directions:
- **Left Wheels (`Wheel_FL`, `Wheel_RL`):** Roll forward with negative delta (`obj.rotation_euler.z -= dtheta`).
- **Right Wheels (`Wheel_FR`, `Wheel_RR`):** Roll forward with positive delta (`obj.rotation_euler.z += dtheta`).

Transforms are applied via `rotation_euler` without modifying geometry or adding keyframes.

---

## 5. Tyre Selection & Non-Destructive Highlighting

TYRETRACE synchronizes tyre selection between the dashboard and Blender:
- Clicking a tyre card or 3D wheel in the web dashboard calls `POST /api/component/select` (or sends a WebSocket command `{"type": "tyre_select", "tyre": "FR"}`).
- The backend updates `pipeline.selected_component = "Wheel_FR"` and broadcasts it in subsequent WebSocket frames.
- **Blender Highlighting:**
  - The bridge intercepts `selected_component = "Wheel_FR"`.
  - The material slot `Tyre_FR_Center` receives an engineering cyan glow (`(0.0, 0.94, 1.0, 1.0)`, strength `2.5`).
  - Baseline material properties (`Emission Color`, `Emission Strength`) are cached at initialization and restored when the tyre is deselected.
  - No permanent material mutations are saved to disk.

---

## 6. Camera System & 3D Engineering HUD

- **Camera Transitions:**
  - When `FL` is selected: Scene camera automatically transitions to the existing `CAM_Wheel_FL_Close`.
  - When deselected or reset: Camera smoothly transitions back to the overview `Camera`.
- **In-Scene Engineering HUD:**
  - A lightweight 3D text curve (`TYRETRACE_HUD`) is rendered in the paddock showing:
    ```
    TYRETRACE | REPLAY
    TDI: 5.7 (HEALTHY_LOW_EVIDENCE) | CONF: 85%
    SPD: 312 km/h | GEAR: 8 | DRS: ACTIVE
    LAP: 12 | SEQ: #245
    ```

---

## 7. Mode Separation: REAL_REPLAY vs. DEMO_SIMULATION

| Attribute | `REAL_REPLAY` | `DEMO_SIMULATION` |
| :--- | :--- | :--- |
| **Data Source** | Real replayed FastF1 telemetry | Synthetic 4-wheel degradation model |
| **Four-Wheel TDI** | Strictly `UNAVAILABLE` (`tdi = null`) | 4-wheel values displayed (0–100%) |
| **Visual Tyre Appearance** | Standard neutral dark racing compound | Dynamic thermal/wear emission shaders |
| **Scientific Meaning** | Transparent acknowledgement of missing sensors | Explicitly labeled simulated demonstration |
| **State Reset** | Reverts immediately to `UNAVAILABLE` on toggle | N/A |

---

## 8. Files Created & Modified

### Files Created:
1. [`blender/tyretrace_live_bridge.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/blender/tyretrace_live_bridge.py): Complete Blender digital twin live bridge script (parser, network worker, scene manager, UI panel, and operators).
2. [`blender/README.md`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/blender/README.md): Step-by-step documentation for setup, startup, controls, troubleshooting, and testing.
3. [`tests/test_blender_integration.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/tests/test_blender_integration.py): 11 comprehensive automated tests covering parsing, mode separation, fault injection, reconnects, and real headless Blender execution.
4. [`PHASE11_REPORT.md`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/PHASE11_REPORT.md): This authoritative final report.

### Files Modified:
1. [`backend/blender/bridge.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/backend/blender/bridge.py): Added `selected_component` caching and `DEMO_SIMULATION` simulated corner slots.
2. [`backend/api/pipeline.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/backend/api/pipeline.py): Added `set_selected_component` and `set_data_mode` helpers.
3. [`backend/api/schemas.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/backend/api/schemas.py): Added `ComponentSelectRequest`, `ComponentSelectResponse`, `ModeSelectRequest`, `ModeSelectResponse`.
4. [`backend/api/routes.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/backend/api/routes.py): Added `/api/component/select`, `/api/component/selected`, `/api/mode` endpoints.
5. [`backend/api/app.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/backend/api/app.py): Added client JSON control message handling in WebSocket loop.
6. [`frontend/src/services/api.ts`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/frontend/src/services/api.ts): Added `selectTyre` and `setDataMode` API client methods.
7. [`frontend/src/pages/DashboardPage.tsx`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/frontend/src/pages/DashboardPage.tsx): Connected `handleSelectTyre` and `toggleDataMode` to synchronize state with the backend.

---

## 9. Testing & Validation Results

### Backend Automated Tests:
- **Backend Tests Before Phase 11:** 128 passed
- **New Blender Integration Tests:** 11 passed (`tests/test_blender_integration.py`)
- **Backend Tests After Phase 11:** **139 passed** (0 failures, 0 regressions)

### Frontend Automated Tests:
- **Frontend Tests Before Phase 11:** 20 passed
- **Frontend Tests After Phase 11:** **20 passed** (0 failures)
- **Production Build:** `tsc -b && vite build` passed cleanly in **320 ms** (0 TypeScript errors)

### Total System Tests:
- **Total Passing Automated Tests:** **159 passed**

---

## 10. Manual Validation Checklist

1. **Start Backend:** `.venv/bin/uvicorn backend.api.app:app --host 0.0.0.0 --port 8000` $\to$ `Application startup complete`.
2. **Start Frontend:** `npm run dev --prefix frontend` $\to$ Web dashboard available on `http://localhost:5173`.
3. **Open Blender:** Launch Blender with `blender/Formula_2_Car_DigitalTwin_V7_Mechanical_Thermal.blend`.
4. **Execute Bridge:** Run `blender/tyretrace_live_bridge.py` in Blender Scripting tab.
5. **Connect:** Click **[ Connect ]** in 3D Viewport Sidebar (TYRETRACE tab). Status updates to **● CONNECTED**.
6. **Start Replay:** Click **[ Play ]** in React dashboard.
7. **Verify Wheel Spin:** In Blender 3D view, wheels rotate smoothly according to vehicle speed.
8. **Verify Tyre Selection:** Click `FR` in React dashboard. In Blender, `Wheel_FR` lights up with a cyan highlight.
9. **Verify Camera Transition:** Click `FL` in React dashboard. In Blender, active camera switches to `CAM_Wheel_FL_Close`.
10. **Verify Mode Separation:** In `REAL_REPLAY`, corner status shows `UNAVAILABLE`. Toggle to `DEMO_SIMULATION`, and simulated TDI heatmaps appear. Toggle back to `REAL_REPLAY`, and values immediately clear.
11. **Verify Robustness:** Kill backend server. Blender UI remains completely responsive and displays `○ DISCONNECTED`. Restart backend, click **[ Connect ]**, and stream resumes without restarting Blender.

---

## 11. Known Limitations

1. **Pre-Configured Cameras in .blend:** The provided Blender file contains `CAM_Wheel_FL_Close` and `Camera`. Close-up angles for FR, RL, and RR reuse the global camera transform rather than modifying the user's camera collection.
2. **Thermal Shader Nodes:** In accordance with the prompt ("DO NOT implement thermal integration in this phase"), the bridge applies emission tint highlights rather than altering material node graph logic.

---

## 12. Final Status Summary

```
============================================================
PHASE 11 STATUS:
COMPLETE

Backend tests before:           128
Backend tests after:            139
Frontend tests before:          20
Frontend tests after:           20
New Blender integration tests:  11
Total tests:                    159 passing
Build status:                   SUCCESS (0 TypeScript errors)
============================================================
```

*Phases 1–11 are complete, verified, and frozen. The existing Blender car model is now fully connected and visually synchronized with the TYRETRACE Command Center.*
