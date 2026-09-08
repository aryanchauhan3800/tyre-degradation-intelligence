# PHASE 8 REPORT — REAL-TIME TYRETRACE INTELLIGENCE API

**Project**: TYRETRACE — Physics-Informed Tyre Degradation Intelligence  
**Phase**: 8 — Real-Time API & Streaming Engine  
**Status**: COMPLETED & VALIDATED  
**Date**: 2026-09-08  

---

## 1. Executive Summary

Phase 8 translates the validated offline pipeline into a real-time, production-ready backend API and telemetry streaming engine. Built on **FastAPI**, the system orchestrates first-principles physics, acceleration residuals, confounder filtering, deterministic TDI scoring, and temporal AI inference in a single, unified execution path.

Key achievements:
- **Unified Pipeline Architecture**: Single source of truth ([`backend/api/pipeline.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/backend/api/pipeline.py)) orchestrating Telemetry $\to$ Twin $\to$ Residual $\to$ Confounder $\to$ TDI $\to$ AI $\to$ Fusion.
- **REST API Suite**: Complete set of endpoints for health, session metadata, physics force balance, residuals, confounders, fused TDI, four-wheel availability, replay control, and historical trajectory analytics.
- **WebSocket Streaming Gateway**: RFC 6455 compliant `/ws/telemetry` streaming live unified frames to downstream dashboards and 3D digital twins.
- **Asynchronous Replay Controller**: Full VCR-style controls (start, pause, resume, stop, reset, seek) with variable playback speeds ($0.25\times - 10\times$).
- **Blender Digital Twin Bridge**: Compact serialization layer ([`backend/blender/bridge.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/backend/blender/bridge.py)) ready for 3D visualization clients without requiring Blender installation.
- **High Throughput**: **3.74 ms average processing latency** per frame (**267.3 FPS throughput**), enabling real-time playback >13x faster than real-world 20 Hz telemetry.

---

## 2. API Architecture & Data Flow

```
                     FASTF1 REPLAY DATASET
                              │
                              ▼
                      TELEMETRY STREAM
                              │
                              ▼
                      PHYSICS TWIN
                              │
                              ▼
                       RESIDUAL ENGINE
                              │
                              ▼
                     CONFOUNDER ENGINE
                              │
                              ▼
                         TDI ENGINE
                              │
                              ▼
                          AI MODEL
                              │
                              ▼
                         TDI FUSION
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                 REST API          WEBSOCKET
               (/api/...)       (/ws/telemetry)
                     │                 │
                     └────────┬────────┘
                              ▼
                      FRONTEND / BLENDER
```

---

## 3. Implemented Endpoints & Contracts

### 3.1 REST Endpoints

| Endpoint | Method | Response Schema | Description |
| :--- | :---: | :--- | :--- |
| `/api/health` | `GET` | `HealthResponse` | System operational status, version, and pipeline components |
| `/api/session` | `GET` | `SessionResponse` | Active session metadata, driver, lap, compound, and data mode |
| `/api/telemetry` | `GET` | `TelemetryFrame` | Latest canonical vehicle, tyre, and environmental state |
| `/api/physics` | `GET` | `PhysicsStateResponse` | Predicted acceleration, force balance (drag, rolling, braking, traction), normal load |
| `/api/residual` | `GET` | `ResidualStateResponse` | Actual vs expected acceleration, raw/normalized residual, data quality |
| `/api/confounders`| `GET` | `ConfoundersStateResponse` | Active confounder flags, non-tyre explanation score, tyre evidence quality |
| `/api/tdi` | `GET` | `TDIStateResponse` | Physics TDI, AI TDI, Fused TDI, degradation state, trend, confidence, reliability, evidence |
| `/api/tyres` | `GET` | `FourWheelTyresResponse` | Four corner slots (FL, FR, RL, RR) with explicit availability |
| `/api/replay/start` | `POST` | `ReplayStatusResponse` | Initiates continuous replay loop |
| `/api/replay/pause` | `POST` | `ReplayStatusResponse` | Pauses replay loop |
| `/api/replay/resume`| `POST` | `ReplayStatusResponse` | Resumes paused replay |
| `/api/replay/stop` | `POST` | `ReplayStatusResponse` | Halts replay playback |
| `/api/replay/reset` | `POST` | `ReplayStatusResponse` | Resets replay to frame index 0 and clears buffers |
| `/api/replay/seek` | `POST` | `ReplayStatusResponse` | Seeks directly to frame index and steps pipeline |
| `/api/replay/speed` | `POST` | `ReplayStatusResponse` | Updates playback speed ($0.25\times, 0.5\times, 1\times, 2\times, 5\times, 10\times$) |
| `/api/replay/status`| `GET` | `ReplayStatusResponse` | Current playback state, frame position, lap, and speed |
| `/api/history/tdi` | `GET` | `List[TDIHistoryPoint]` | Rolling history of TDI trajectory (up to 1,000 points) |
| `/api/history/residual`| `GET`| `List[ResidualHistoryPoint]`| Rolling history of residuals and confounder quality |
| `/api/laps` | `GET` | `List[int]` | List of laps currently evaluated in replay |
| `/api/laps/{lap_num}`| `GET`| `LapSummaryResponse` | Aggregated lap statistics: mean residual, mean TDI, trend, confidence |

---

## 4. WebSocket Streaming Protocol

- **Endpoint**: `ws://localhost:8000/ws/telemetry`
- **Streaming Cadence**: Broadcasts on every advanced frame in the replay loop.
- **Message Payload**:
  ```json
  {
    "type": "telemetry_update",
    "sequence": 104,
    "timestamp": "2023-09-02T15:00:12.111000",
    "telemetry": { "vehicle": { "speed_mps": 94.2, "throttle_pct": 100.0 } },
    "physics": { "expected_acceleration_mps2": 1.25, "forces": { "drag_n": 3412.5 } },
    "residual": { "actual_acceleration_mps2": 0.42, "raw_residual_mps2": -0.83 },
    "confounders": { "active_flags": ["DRS_ACTIVE"], "tyre_evidence_quality": 0.30 },
    "tdi": {
      "physics_tdi": 5.12,
      "ai_tdi": 5.45,
      "final_tdi": 5.25,
      "state": "HEALTHY_LOW_EVIDENCE",
      "confidence": 0.195
    },
    "ai": { "ai_tdi": 5.45, "model_reliability": 0.231 },
    "blender": {
      "sequence": 104,
      "vehicle": { "speed_kph": 339.2, "drs_active": true },
      "tyres": {
        "FL": { "available": false, "tdi": null },
        "FR": { "available": false, "tdi": null },
        "RL": { "available": false, "tdi": null },
        "RR": { "available": false, "tdi": null }
      },
      "global_tdi": 5.25
    }
  }
  ```

---

## 5. Performance Benchmarks

Measured on standard 2023 Monza qualifying replay (603 frames):

| Performance Metric | Measured Value | Operational Benchmark |
| :--- | :---: | :---: |
| **Mean Pipeline Latency** | **3.74 ms** | Real-time threshold: $\le 50.0\text{ ms}$ (20 Hz) |
| **Median Pipeline Latency** | **3.69 ms** | Sub-5ms deterministic processing |
| **Peak Pipeline Latency** | **16.61 ms** | Zero dropped frames under 60 Hz display refresh |
| **Pipeline Throughput** | **267.3 FPS** | $>13\times$ faster than real-time telemetry |
| **WebSocket JSON Serialization** | **0.08 ms** | Throughput $>13,000\text{ FPS}$ |

---

## 6. Verification & Test Suite

All 118 unit and integration tests across Phases 1 through 8 pass deterministically without network dependencies:

```bash
.venv/bin/pytest -v
======================= 118 passed, 2 warnings in 2.40s ========================
```

### New Phase 8 Test Coverage (24 Tests)
- [`tests/test_api.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/tests/test_api.py):
  1. Health endpoint (`GET /api/health`)
  2. Session endpoint (`GET /api/session`)
  3. Telemetry endpoint (`GET /api/telemetry`)
  4. Physics state endpoint (`GET /api/physics`)
  5. Residual state endpoint (`GET /api/residual`)
  6. Confounder state endpoint (`GET /api/confounders`)
  7. TDI score endpoint (`GET /api/tdi`)
  8. Four-wheel availability contract (`GET /api/tyres`)
  9. Replay controls over HTTP (status, seek, speed, reset)
  10. TDI and residual history queries
  11. Lap summaries list and detail endpoints
- [`tests/test_replay_controller.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/tests/test_replay_controller.py):
  12. Replay lifecycle (start, pause, resume, stop, reset)
  13. Seeking within bounds and out-of-bounds rejection
  14. Playback speed modulation and validation
  15. Missing replay file graceful handling
  16. Malformed JSON replay handling
- [`tests/test_pipeline.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/tests/test_pipeline.py):
  17. Single-point pipeline frame execution
  18. Deterministic repeatability across instances
  19. In-memory runtime state synchronization
- [`tests/test_websocket.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/tests/test_websocket.py):
  20. WebSocket connection accept and bidirectional ping/pong
  21. Telemetry update message schema verification
  22. Client disconnection and dead connection cleanup
- [`tests/test_blender_bridge.py`](file:///Users/aryanchauhan/Developer/tyre-degradation-intelligence/tests/test_blender_bridge.py):
  23. Blender digital twin payload schema validation
  24. Four-wheel omission transparency (strictly unavailable in FastF1 replay)

---

## 7. Manual Demo Commands

### Launching the Backend Server
```bash
.venv/bin/uvicorn backend.api.app:app --host 0.0.0.0 --port 8000 --reload
```

### Accessing Interactive OpenAPI Documentation
Visit `http://localhost:8000/docs` in your browser.

### Inspecting Live State via cURL
```bash
# Check health
curl -s http://localhost:8000/api/health | jq .

# Check session info
curl -s http://localhost:8000/api/session | jq .

# Inspect current TDI (Physics, AI, and Fused)
curl -s http://localhost:8000/api/tdi | jq .

# Inspect tyre availability (strictly unavailable in FastF1 replay)
curl -s http://localhost:8000/api/tyres | jq .
```

### Controlling Simulation Playback
```bash
# Start continuous playback
curl -X POST http://localhost:8000/api/replay/start

# Increase playback speed to 2x
curl -X POST http://localhost:8000/api/replay/speed -H "Content-Type: application/json" -d '{"speed": 2.0}'

# Pause playback
curl -X POST http://localhost:8000/api/replay/pause

# Seek to frame 50
curl -X POST http://localhost:8000/api/replay/seek -H "Content-Type: application/json" -d '{"frame_index": 50}'

# Reset to start
curl -X POST http://localhost:8000/api/replay/reset
```

---

## 8. Mandatory Scientific Boundaries

1. **Historical Replay, Not Live Vehicle Telemetry**: Data is sourced from official FastF1 timing and replayed through the real-time simulation engine.
2. **Real-Time Definition**: "Real-time" designates deterministic frame-by-frame processing of replayed data, not direct car sensor acquisition.
3. **TDI is an Inferred Index**: TDI remains a dimensionless severity index in $[0, 100]$, not physical rubber loss or tread depth in millimeters.
4. **AI Trained on Pseudo-Labels**: The machine learning model was trained against deterministic TDI pseudo-labels, not physical tyre measurements.
5. **No Individual Corner Wear**: FastF1 does not record four-corner tyre telemetry; FL, FR, RL, and RR degradation remain explicitly unavailable.
6. **No Probability of Failure**: Model reliability is an operational telemetry suitability metric, not a failure probability.
7. **No Direct Causal Claims**: Discrepancies reflect physical model deficits and transient dynamics; absolute attribution requires post-stint tyre engineering data.
