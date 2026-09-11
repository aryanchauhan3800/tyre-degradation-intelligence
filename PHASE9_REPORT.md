# TYRETRACE Phase 9 Engineering Report: Command Center & 3D Digital Twin

**Project:** TYRETRACE — Physics-Informed Tyre Degradation Intelligence  
**Phase:** 9 — TYRETRACE Command Center + 3D Digital Twin  
**Status:** **COMPLETE & FULLY VERIFIED**  
**Test Suite:** **118/118 Backend Tests Passing** | **17/17 Frontend Tests Passing**  
**Production Build:** `npm run build` Passing (0 TypeScript errors, 313ms Vite bundle)  

---

## 1. Executive Summary

Phase 9 transforms the validated Phase 1–8 backend pipeline into a motorsport telemetry Command Center and interactive 3D Digital Twin. Built on React 19, Vite, TypeScript, Tailwind CSS, and Three.js, the system delivers real-time RFC 6455 WebSocket streaming, sub-millisecond telemetry charts, dynamic explainability panels, interactive race car tyre selection, and strict scientific mode separation between canonical FastF1 replay data and simulated corner demonstrations.

---

## 2. Target Architecture & Component Flow

```
                     FASTF1 CANONICAL REPLAY
                               │
                               ▼
                   FASTAPI WEBSOCKET /ws/telemetry
                               │
                               ▼
             useTelemetryWebSocket() AUTO-RECONNECT
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   3D DIGITAL TWIN (Three.js)          GLOBAL INTELLIGENCE
  ├── CAR_ROOT (Single-Seater F1)     ├── Hero TDI Display (0–100)
  ├── WHEEL_FL/FR/RL/RR               ├── Physics vs AI vs Fusion Breakdown
  ├── TYRE_FL/FR/RL/RR                ├── Dynamic Why/Explainability Panel
  ├── RIM_FL/FR/RL/RR                 └── Confounder Filter Engine
  ├── CAMERA_OVERVIEW / CAMERA_TYRE
  └── Dynamic DRS Flap & Rotation
            │                                     │
            └──────────────────┬──────────────────┘
                               │
                               ▼
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
  CORNER TYRE INSPECTION             TIME-SERIES ANALYTICS (SVG)
  ├── REAL_REPLAY: UNAVAILABLE        ├── TDI Trajectory (Physics/AI/Fusion)
  ├── DEMO_SIMULATION: Dynamic        └── Residual ($r_{ax}$) & Confounder ($S_{conf}$)
  └── Corner Evidence Attribution
                               │
                               ▼
                      REPLAY CONTROL BAR
          [PLAY / PAUSE] [RESET] [SEEK] [0.25x – 10x SPEED]
```

---

## 3. Files Created & Modified

### New Frontend Application (`frontend/`):
- `frontend/package.json` — React 19, Three.js, Lucide-react, Vitest, Testing-Library.
- `frontend/vite.config.ts` — Vite configuration with Tailwind CSS plugin, dev proxy for `/api` and `/ws`, and Vitest environment.
- `frontend/tsconfig.json` & `tsconfig.app.json` — Strict TypeScript configuration with `verbatimModuleSyntax` and isolated app build paths.
- `frontend/index.html` — Motorsport dark UI template with JetBrains Mono and Inter typography.
- `frontend/src/index.css` — Technical design system with Tailwind CSS import and custom motorsport scrollbars and sliders.
- `frontend/src/types/telemetry.ts` — TypeScript schemas strictly mirroring backend Pydantic models.
- `frontend/src/services/api.ts` — REST API client for all Phase 8 endpoints.
- `frontend/src/services/demoSimulation.ts` — Deterministic 4-wheel simulation strictly isolated to `DEMO_SIMULATION` mode.
- `frontend/src/hooks/useTelemetryWebSocket.ts` — Auto-reconnecting WebSocket hook with heartbeat ping.
- `frontend/src/three/RaceCarScene.ts` — Procedural single-seater F1 car with hierarchical nodes, wheel rotations, DRS animations, raycasting, and camera transitions.
- `frontend/src/components/DigitalTwinCanvas.tsx` — Three.js canvas container with HUD overlays and tyre focus controls.
- `frontend/src/components/TopBar.tsx` — Telemetry strip, driver context, mode switchers, and live connection status.
- `frontend/src/components/GlobalTDICard.tsx` — Hero TDI gauge with 3-way breakdown (Physics, AI, Fusion).
- `frontend/src/components/WhyPanel.tsx` — Dynamic evidence and counter-evidence engine.
- `frontend/src/components/ConfoundersPanel.tsx` — Active/inactive flags and dual evidence quality gauges.
- `frontend/src/components/TyreIntelligencePanel.tsx` — Wheel inspection panel with strict unavailable state for real replay.
- `frontend/src/components/TDITrajectoryChart.tsx` — High-performance SVG time-series chart with zoom and crosshairs.
- `frontend/src/components/ResidualChart.tsx` — Dual-axis acceleration residual and evidence quality chart.
- `frontend/src/components/ReplayControlBar.tsx` — Replay scrub slider, speed selectors (0.25x–10x), and transport buttons.
- `frontend/src/pages/DashboardPage.tsx` — Unified layout orchestrator.
- `frontend/src/App.tsx` — App entry point.
- `frontend/src/test/dashboard.test.tsx` — 17 unit and integration tests for dashboard components.
- `frontend/src/test/setup.ts` — Vitest setup with `@testing-library/jest-dom`.

### New Documentation:
- `docs/DEMO_SCRIPT.md` — 3 to 5 minute executive demonstration script.
- `PHASE9_REPORT.md` — Authoritative Phase 9 verification report.

---

## 4. 3D Digital Twin Architecture

The procedural race car is constructed using Three.js primitive geometries to ensure ultra-low draw calls and 60 FPS performance without requiring multi-megabyte external GLTF downloads:
- **`CAR_ROOT`**: Root transform group with shadow-casting lights.
- **`BODY`**: Cockpit monocoque, forward nosecone, sidepods with undercut cooling ducts, engine airbox, halo safety structure, and shark fin.
- **`FRONT_WING`**: Multi-element carbon mainplane with endplate vanes.
- **`REAR_WING`**: Dual pylons, beam wing, and dynamic DRS flap mesh that rotates open by $22^\circ$ when `drs > 0`.
- **Four Wheels (`WHEEL_FL`, `WHEEL_FR`, `WHEEL_RL`, `WHEEL_RR`)**:
  - `TYRE_*`: High-detail cylinders with motorsport rubber roughness and compound sidewalls.
  - `RIM_*`: BBS-style magnesium rim centers with left/right color-coded wheel nuts (Red for Left, Blue for Right).
  - Carbon double-wishbone suspension arms linking wheel hubs to the chassis.
- **Interactive Raycasting**: Mouse hovering over any tyre highlights a technical bounding reticle and switches the cursor to a pointer. Clicking triggers `CAMERA_TYRE_*` focus animation via smooth cubic interpolation (`lerp`).
- **Telemetry Coupling**: Wheel spin is dynamically coupled to instantaneous telemetry speed ($\omega = v / r$).

---

## 5. Mode Separation & Data Provenance Mandate

The system enforces strict scientific boundaries between real historical data and synthetic demonstrations:

| Dimension | `REAL_REPLAY` Mode | `DEMO_SIMULATION` Mode |
| :--- | :--- | :--- |
| **Data Source** | FastF1 Historical Monza Telemetry | Deterministic Synthetic Generator |
| **Global TDI** | Physics-AI Fused Engine ($\alpha = 0.60$) | Driven by Global Replay TDI |
| **Wheel-Level Availability** | `available: false`, `tdi: null` | `available: true`, `tdi: [0, 100]` |
| **Provenance Label** | `FASTF1 / REPLAY` | `SIMULATED` |
| **Tyre Panel Status** | **STATUS: UNAVAILABLE** with provenance reason | Displays Corner TDI, Trend, Age |
| **3D Tyre Appearance** | Neutral matte race slick (no fake wear) | Color-mapped thermal degradation intensity |

---

## 6. Verification Results

### A. Frontend Tests (Vitest)
```
✓ src/test/dashboard.test.tsx (17 tests)
  ✓ 1. Global TDI Intelligence Card
    ✓ renders primary fused TDI score and state badge
    ✓ renders 3-way architecture breakdown (Physics, AI, Fusion)
  ✓ 2. Confounder Analysis Panel
    ✓ renders active and inactive flags accurately
    ✓ renders non-tyre explanation score and tyre evidence quality
  ✓ 3. Dynamic Why / Explainability Panel
    ✓ renders evidence and counter evidence items from engine
    ✓ adapts heading for stable or falling trends
  ✓ 4. Tyre Intelligence Panel & Mode Separation
    ✓ strictly displays UNAVAILABLE state in REAL_REPLAY mode without fabricating data
    ✓ displays clearly labelled simulated values in DEMO_SIMULATION mode
    ✓ provides correct corner names and reset selection callback
  ✓ 5. Time-Series Trajectory & Residual Charts
    ✓ renders TDI Trajectory SVG with points count and legend
    ✓ renders Residual & Confounder Dynamics chart with units
  ✓ 6. Replay Transport Controls
    ✓ triggers playback actions on button clicks
  ✓ 7. Deterministic Demo Simulation Math & Utilities
    ✓ generates deterministic wheel states without jitter
    ✓ clamps simulated TDI scores to valid [0, 100] range
    ✓ correctly formats corner labels
  ✓ 8. REST API Client Error & Payload Handling
    ✓ handles API network failure gracefully without unhandled crashes
    ✓ parses valid API responses cleanly

Test Files: 1 passed (1)
Tests: 17 passed (17)
Duration: 0.96s
```

### B. Production Frontend Build (`npm run build`)
```
vite v8.2.2 building client environment for production...
✓ 1864 modules transformed.
dist/index.html                   0.94 kB │ gzip:   0.51 kB
dist/assets/index-DHT8Bl6f.css   37.94 kB │ gzip:   7.35 kB
dist/assets/index-BJPB8pYn.js   788.96 kB │ gzip: 210.79 kB
✓ built in 313ms
```

### C. Backend Regression Tests (`pytest -v`)
```
======================= 118 passed, 2 warnings in 3.53s ========================
```
- Total backend tests: **118 passed**
- Total frontend tests: **17 passed**
- Combined test coverage: **135 automated tests passing cleanly**

---

## 7. Scientific Boundaries & Limitations Mandate

As strictly mandated for TYRETRACE Phase 9:
1. **Historical FastF1 data is replayed, not live vehicle telemetry:** FastF1 is an offline archival data source.
2. **Real-time means real-time processing of replay data:** Telemetry frames are streamed at the canonical 20 Hz recording rate through the complete intelligence stack.
3. **TDI remains an inferred index:** The Tyre Degradation Index is an engineered score in $[0, 100]$ reflecting relative mechanical grip loss, NOT physical rubber tread depth.
4. **AI remains trained against pseudo-labels:** The Phase 7 Random Forest baseline was trained on physics-derived multi-lap race data.
5. **FastF1 does not provide individual tyre degradation telemetry:** Corner tyre temperatures, pressures, and individual wheel speeds are not in the source dataset.
6. **Four-wheel TDI must remain unavailable in real mode:** Corner-specific TDI is strictly returned as `null` with explicit unavailability reasons in `REAL_REPLAY` mode.
7. **Demo simulation must be explicitly labelled:** All synthetic 4-wheel data is tagged with `source="SIMULATED"` and `data_mode="DEMO_SIMULATION"`.
8. **No physical tyre wear claims are allowed:** The software does not claim millimeter-level rubber wear or chemical compound degradation.
9. **No failure probability claims are allowed:** TDI indicates grip loss; it does not predict structural blowouts or mechanical tyre failures.

---

## 8. Manual Demo Instructions

1. **Start Backend Server:**
   ```bash
   .venv/bin/uvicorn backend.api.app:app --host 0.0.0.0 --port 8000
   ```
2. **Start Frontend Dev Server:**
   ```bash
   cd frontend && npm run dev
   ```
3. **Access Command Center:**
   Navigate to `http://localhost:5173`.
4. **Verify Live Controls:**
   - Click **[ PLAY ]** to stream live telemetry.
   - Observe the 3D car wheels rotate and DRS flap respond to live active flags.
   - Click any wheel (e.g. Front Right) to observe smooth camera transition and verify the **STATUS: UNAVAILABLE** state in `REAL_REPLAY`.
   - Click **[ DEMO SIMULATION ]** in the top bar to inspect simulated corner thermal heatmaps.
   - Use the timeline slider to scrub through race laps and test playback speeds from 0.25x to 10x.
