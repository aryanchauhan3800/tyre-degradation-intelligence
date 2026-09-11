"""
TYRETRACE — Real-Time API REST Endpoint Tests
Tests all FastAPI REST endpoints: health, session, telemetry, physics, residual,
confounder, TDI, tyre availability, history, laps, and replay control requests.
"""

import pytest
from fastapi.testclient import TestClient
from backend.api.app import create_app


@pytest.fixture(scope="module")
def client():
    # Initialize test app with default replay dataset
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "TYRETRACE"
    assert "physics_residual_confounder_tdi_ai" in data["pipeline"]


def test_session_endpoint(client):
    response = client.get("/api/session")
    assert response.status_code == 200
    data = response.json()
    assert data["data_mode"] == "REPLAY"
    assert "session_id" in data
    assert data["driver"] == "VER"
    assert data["year"] == 2023


def test_telemetry_endpoint(client):
    response = client.get("/api/telemetry")
    assert response.status_code == 200
    data = response.json()
    assert "vehicle" in data
    assert "speed_mps" in data["vehicle"]
    assert "throttle_pct" in data["vehicle"]
    assert "tyres" in data


def test_physics_endpoint(client):
    response = client.get("/api/physics")
    assert response.status_code == 200
    data = response.json()
    assert "expected_acceleration_mps2" in data
    assert "forces" in data
    assert "drag_n" in data["forces"]
    assert "traction_n" in data["forces"]
    assert "load_transfer_n" in data


def test_residual_endpoint(client):
    response = client.get("/api/residual")
    assert response.status_code == 200
    data = response.json()
    assert "expected_acceleration_mps2" in data
    assert "quality_status" in data
    assert data["quality_status"] in ("VALID", "LOW_CONFIDENCE", "MISSING_INPUT")


def test_confounder_endpoint(client):
    response = client.get("/api/confounders")
    assert response.status_code == 200
    data = response.json()
    assert "non_tyre_explanation_score" in data
    assert "tyre_evidence_quality" in data
    assert 0.0 <= data["non_tyre_explanation_score"] <= 1.0
    assert 0.0 <= data["tyre_evidence_quality"] <= 1.0


def test_tdi_endpoint(client):
    response = client.get("/api/tdi")
    assert response.status_code == 200
    data = response.json()
    assert "physics_tdi" in data
    assert "ai_tdi" in data
    assert "final_tdi" in data
    assert "confidence" in data
    assert "model_reliability" in data
    assert "evidence" in data
    assert "counter_evidence" in data
    assert 0.0 <= data["final_tdi"] <= 100.0


def test_tyres_availability_endpoint(client):
    # Strictly asserts that four-wheel corner wear remains unavailable for FastF1 data
    response = client.get("/api/tyres")
    assert response.status_code == 200
    data = response.json()
    assert "FL" in data and "FR" in data and "RL" in data and "RR" in data
    for corner in ("FL", "FR", "RL", "RR"):
        slot = data[corner]
        assert slot["available"] is False
        assert slot["tdi"] is None
        assert "unavailable" in slot["reason"].lower()


def test_replay_controls_via_http(client):
    # Status
    res = client.get("/api/replay/status")
    assert res.status_code == 200
    status_data = res.json()
    assert "current_frame" in status_data

    # Speed change
    res_speed = client.post("/api/replay/speed", json={"speed": 2.0})
    assert res_speed.status_code == 200
    assert res_speed.json()["playback_speed"] == 2.0

    # Seek
    res_seek = client.post("/api/replay/seek", json={"frame_index": 5})
    assert res_seek.status_code == 200
    assert res_seek.json()["current_frame"] == 6  # After step_frame in seek

    # Reset
    res_reset = client.post("/api/replay/reset")
    assert res_reset.status_code == 200
    assert res_reset.json()["current_frame"] == 0


def test_history_endpoints(client):
    # Ensure some history exists by seeking a few frames
    client.post("/api/replay/seek", json={"frame_index": 3})

    # TDI History
    res_tdi = client.get("/api/history/tdi?limit=50")
    assert res_tdi.status_code == 200
    tdi_points = res_tdi.json()
    assert isinstance(tdi_points, list)
    assert len(tdi_points) > 0
    assert "final_tdi" in tdi_points[0]

    # Residual History
    res_res = client.get("/api/history/residual?limit=50")
    assert res_res.status_code == 200
    res_points = res_res.json()
    assert isinstance(res_points, list)
    assert len(res_points) > 0
    assert "tyre_evidence_quality" in res_points[0]


def test_lap_summary_endpoints(client):
    client.post("/api/replay/seek", json={"frame_index": 5})

    # Laps list
    res_laps = client.get("/api/laps")
    assert res_laps.status_code == 200
    laps = res_laps.json()
    assert len(laps) > 0

    first_lap = laps[0]
    res_summary = client.get(f"/api/laps/{first_lap}")
    assert res_summary.status_code == 200
    summary = res_summary.json()
    assert summary["lap"] == first_lap
    assert "mean_tdi" in summary
    assert "sample_count" in summary
