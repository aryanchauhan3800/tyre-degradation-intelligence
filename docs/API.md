# TYRETRACE — Real-Time Tyre Degradation Intelligence API

**Service**: `TYRETRACE`  
**Version**: `1.0.0`  
**Protocol**: HTTP/1.1 (REST) & WebSocket (RFC 6455)  
**Base URL**: `http://localhost:8000`  
**WebSocket URL**: `ws://localhost:8000/ws/telemetry`  
**Data Mode**: `REPLAY` (Historical FastF1 Telemetry)  

---

## 1. Overview & Architectural Contract

The TYRETRACE API delivers real-time telemetry streaming, physics-based digital twin calculations, actual-vs-expected residuals, deterministic confounder analysis, and fused temporal AI degradation intelligence.

### Scientific Integrity Policy
1. **Source Origin**: In `REPLAY` mode, telemetry originates from official historical FastF1 session captures. It is replayed through the complete mathematical pipeline in simulated real-time.
2. **Four-Wheel Degradation**: FastF1 does NOT provide wheel-level tyre wear telemetry. Wheel slots (`FL`, `FR`, `RL`, `RR`) return `available: false` and `tdi: null`.
3. **Score Separation**: Physics TDI, AI TDI, and Final Fused TDI are strictly exposed independently.
4. **Units**: All telemetry units are explicit (SI units: `m/s`, `m/s^2`, `N`, `km/h`, `deg`, `°C`). Timestamps follow ISO-8601.

---

## 2. REST Endpoints

### 2.1 System & Session

#### `GET /api/health`
Returns system operational status, active software version, and pipeline configuration.
- **Response**: `200 OK`
```json
{
  "status": "ok",
  "service": "TYRETRACE",
  "version": "1.0.0",
  "pipeline": "physics_residual_confounder_tdi_ai"
}
```

#### `GET /api/session`
Returns metadata describing the active telemetry session.
- **Response**: `200 OK`
```json
{
  "session_id": "F1_2023_Italian_Grand_Prix_Q_VER",
  "event": "Italian Grand Prix",
  "year": 2023,
  "session": "Q",
  "driver": "VER",
  "data_mode": "REPLAY",
  "total_laps": 1,
  "current_lap": 20,
  "tyre_compound": "SOFT",
  "tyre_age": 2
}
```

---

### 2.2 Live State Inspection

#### `GET /api/telemetry`
Returns the latest canonical telemetry frame ingested by the replay engine.
- **Response**: `200 OK`
```json
{
  "timestamp": 4452.111,
  "timestamp_iso": "2023-09-02T15:00:12.111000",
  "session_id": "F1_2023_Italian_Grand_Prix_Q_VER",
  "lap": 20,
  "driver": "VER",
  "vehicle": {
    "speed_mps": 94.22,
    "speed_kph": 339.2,
    "throttle_pct": 100.0,
    "brake_pct": 0.0,
    "gear": 8,
    "drs": 1
  },
  "tyres": {
    "fl": { "corner": "FL", "compound": "SOFT", "tyre_life_laps": 2, "stint": 7 },
    "fr": { "corner": "FR", "compound": "SOFT", "tyre_life_laps": 2, "stint": 7 },
    "rl": { "corner": "RL", "compound": "SOFT", "tyre_life_laps": 2, "stint": 7 },
    "rr": { "corner": "RR", "compound": "SOFT", "tyre_life_laps": 2, "stint": 7 }
  },
  "environment": {
    "ambient_temp_c": 28.5,
    "track_temp_c": 44.2,
    "humidity_pct": 42.0
  }
}
```

#### `GET /api/physics`
Returns the latest Newton's second law force balance predictions from the Physics Twin.
- **Response**: `200 OK`
```json
{
  "expected_acceleration_mps2": 1.25,
  "forces": {
    "drag_n": 3412.5,
    "rolling_resistance_n": 122.1,
    "brake_force_n": 0.0,
    "traction_n": 4530.0,
    "net_force_n": 995.4
  },
  "vertical_load_n": 14210.5,
  "load_transfer_n": 625.3,
  "parameter_provenance": {
    "speed_mps": "MEASURED",
    "throttle_pct": "MEASURED",
    "brake_pct": "MEASURED",
    "mass_kg": "MODELLED",
    "cd_a": "MODELLED",
    "crr": "MODELLED"
  }
}
```

#### `GET /api/residual`
Returns the actual acceleration derivative, physics prediction, and raw/normalized residual.
- **Response**: `200 OK`
```json
{
  "actual_acceleration_mps2": 0.42,
  "expected_acceleration_mps2": 1.25,
  "raw_residual_mps2": -0.83,
  "normalized_residual": -0.664,
  "quality_status": "VALID",
  "rolling_features": {},
  "trend": "STABLE"
}
```

#### `GET /api/confounders`
Returns active non-tyre explanation factors and isolated tyre evidence quality.
- **Response**: `200 OK`
```json
{
  "active_flags": ["DRS_ACTIVE", "HIGH_SPEED"],
  "drs_active": true,
  "braking_active": false,
  "throttle_active": true,
  "high_speed_active": true,
  "transient_active": false,
  "tyre_age_laps": 2,
  "compound": "SOFT",
  "non_tyre_explanation_score": 0.70,
  "tyre_evidence_quality": 0.30
}
```

#### `GET /api/tdi`
Returns the independent Physics TDI, AI Inferred Degradation, and Fused Final TDI with explainability.
- **Response**: `200 OK`
```json
{
  "physics_tdi": 5.12,
  "ai_tdi": 5.45,
  "final_tdi": 5.25,
  "state": "HEALTHY_LOW_EVIDENCE",
  "trend": "STABLE",
  "confidence": 0.195,
  "model_reliability": 0.231,
  "evidence": [
    "No significant degradation evidence detected"
  ],
  "counter_evidence": [
    "Non-tyre confounder score (0.70) strongly attenuates degradation confidence",
    "Confounder active: DRS_ACTIVE",
    "Tyre set is fresh (2 laps old), reducing degradation likelihood"
  ]
}
```

#### `GET /api/tyres`
Returns wheel-level degradation telemetry availability.
- **Response**: `200 OK`
```json
{
  "FL": { "available": false, "tdi": null, "reason": "Wheel-level telemetry unavailable in FastF1 source" },
  "FR": { "available": false, "tdi": null, "reason": "Wheel-level telemetry unavailable in FastF1 source" },
  "RL": { "available": false, "tdi": null, "reason": "Wheel-level telemetry unavailable in FastF1 source" },
  "RR": { "available": false, "tdi": null, "reason": "Wheel-level telemetry unavailable in FastF1 source" }
}
```

---

### 2.3 Replay Simulation Controls

| Endpoint | Method | Request Body | Description |
| :--- | :---: | :--- | :--- |
| `/api/replay/start` | `POST` | None | Starts continuous replay loop from current position |
| `/api/replay/pause` | `POST` | None | Pauses playback loop |
| `/api/replay/resume` | `POST` | None | Resumes paused playback |
| `/api/replay/stop` | `POST` | None | Halts replay loop |
| `/api/replay/reset` | `POST` | None | Resets position to frame 0 and clears buffers |
| `/api/replay/seek` | `POST` | `{"frame_index": 120}` | Seeks directly to frame index and steps pipeline |
| `/api/replay/speed` | `POST` | `{"speed": 2.0}` | Updates playback speed multiplier (0.25x - 10x) |
| `/api/replay/status` | `GET` | None | Returns current playback status, frame index, and FPS |

---

### 2.4 Historical Analytics & Laps

#### `GET /api/history/tdi?limit=300`
Returns recent point-by-point TDI trajectory for charting.
- **Response**: `200 OK`
```json
[
  {
    "timestamp_iso": "2023-09-02T15:00:10.000Z",
    "timestamp_sec": 4450.0,
    "lap": 20,
    "physics_tdi": 5.12,
    "ai_tdi": 5.30,
    "final_tdi": 5.19
  }
]
```

#### `GET /api/history/residual?limit=300`
Returns recent acceleration residuals and confounder quality points.
- **Response**: `200 OK`

#### `GET /api/laps`
Returns list of lap numbers currently evaluated.

#### `GET /api/laps/{lap_number}`
Returns lap-level synthesis including mean residual, mean TDI, trend, and confidence.

---

## 3. WebSocket Streaming Gateway

### Endpoint: `ws://localhost:8000/ws/telemetry`

Streams live frame updates synchronously as the replay advances.

### Message Payload Structure
```json
{
  "type": "telemetry_update",
  "sequence": 104,
  "timestamp": "2023-09-02T15:00:12.111000",
  "telemetry": { ... },
  "physics": {
    "expected_acceleration_mps2": 1.25,
    "forces": { "drag_n": 3412.5, "traction_n": 4530.0 }
  },
  "residual": {
    "actual_acceleration_mps2": 0.42,
    "expected_acceleration_mps2": 1.25,
    "raw_residual_mps2": -0.83
  },
  "confounders": {
    "active_flags": ["DRS_ACTIVE"],
    "non_tyre_explanation_score": 0.70,
    "tyre_evidence_quality": 0.30
  },
  "tdi": {
    "physics_tdi": 5.12,
    "ai_tdi": 5.45,
    "final_tdi": 5.25,
    "state": "HEALTHY_LOW_EVIDENCE",
    "confidence": 0.195
  },
  "ai": {
    "ai_tdi": 5.45,
    "model_reliability": 0.231,
    "model_version": "RF_BASELINE_v1.0"
  },
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

## 4. Manual Demo Walkthrough

### 1. Launch Server
```bash
.venv/bin/uvicorn backend.api.app:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Open Interactive OpenAPI Documentation
Visit in browser:
```
http://localhost:8000/docs
```

### 3. Check System Health
```bash
curl -s http://localhost:8000/api/health | jq .
```

### 4. Inspect Active Telemetry & TDI
```bash
curl -s http://localhost:8000/api/tdi | jq .
curl -s http://localhost:8000/api/tyres | jq .
```

### 5. Control Replay Playback
```bash
# Start continuous playback
curl -X POST http://localhost:8000/api/replay/start

# Increase speed to 2x
curl -X POST http://localhost:8000/api/replay/speed -H "Content-Type: application/json" -d '{"speed": 2.0}'

# Pause playback
curl -X POST http://localhost:8000/api/replay/pause

# Seek to frame 50
curl -X POST http://localhost:8000/api/replay/seek -H "Content-Type: application/json" -d '{"frame_index": 50}'

# Reset
curl -X POST http://localhost:8000/api/replay/reset
```
