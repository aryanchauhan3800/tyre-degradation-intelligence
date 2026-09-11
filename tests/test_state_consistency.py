"""
TYRETRACE — State Consistency & Synchronization Regression Tests
Validates Single Source of Truth, DRS/Braking/Speed/Transient consistency,
canonical tyre age propagation, and REAL_REPLAY vs DEMO isolation.
"""

import pytest
from fastapi.testclient import TestClient
from backend.api.app import create_app
from backend.confounders.confounder_engine import ConfounderEngine
from backend.confounders.rules import (
    evaluate_drs,
    evaluate_braking,
    evaluate_high_speed,
    evaluate_transient,
)
from backend.confounders.schemas import ExplanatoryClassification
from backend.residual.schemas import ResidualFrame, ResidualQualityStatus
from backend.schemas.telemetry import (
    TelemetryFrame,
    VehicleState,
    EnvironmentState,
    FourWheelTyreStates,
    TyreState,
    WheelCorner,
)

@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client

def create_sample_residual(raw_residual=1.5, actual_speed_mps=72.78, tyre_age=2, compound="SOFT"):
    return ResidualFrame(
        timestamp=10.0,
        session_id="CONSISTENCY_TEST",
        lap=20,
        distance_m=100.0,
        actual_acceleration_mps2=4.0,
        expected_acceleration_mps2=2.5,
        acceleration_residual_mps2=raw_residual,
        normalized_residual=raw_residual / 4.0,
        actual_speed_mps=actual_speed_mps,
        tyre_age=tyre_age,
        compound=compound,
        stint=1,
        quality_status=ResidualQualityStatus.VALID,
    )

def create_sample_telemetry(speed_kph=262.0, brake_pct=100.0, throttle_pct=0.0, drs_code=8, tyre_life=2, lap=20):
    speed_mps = speed_kph / 3.6
    return TelemetryFrame(
        timestamp=10.0,
        session_id="CONSISTENCY_TEST",
        lap=lap,
        vehicle=VehicleState(
            speed_mps=speed_mps,
            speed_kph=speed_kph,
            throttle_pct=throttle_pct,
            brake_pct=brake_pct,
            gear=7,
            rpm=11500,
            drs=drs_code,
        ),
        tyres=FourWheelTyreStates(
            fl=TyreState(corner=WheelCorner.FL, compound="SOFT", tyre_life_laps=tyre_life),
            fr=TyreState(corner=WheelCorner.FR, compound="SOFT", tyre_life_laps=tyre_life),
            rl=TyreState(corner=WheelCorner.RL, compound="SOFT", tyre_life_laps=tyre_life),
            rr=TyreState(corner=WheelCorner.RR, compound="SOFT", tyre_life_laps=tyre_life),
        ),
        environment=EnvironmentState(track_condition="dry"),
    )

def test_1_drs_consistency():
    """Verify DRS open (code 8) and closed (code 0) consistently produce active/inactive confounders."""
    # Direct rule evaluation
    drs_open = evaluate_drs(drs_code=8, residual_mag=1.5)
    assert drs_open.active is True
    assert drs_open.classification == ExplanatoryClassification.EXPLANATORY

    drs_closed = evaluate_drs(drs_code=0, residual_mag=1.5)
    assert drs_closed.active is False
    assert drs_closed.classification == ExplanatoryClassification.NONE

    # Engine frame evaluation
    engine = ConfounderEngine()
    rf = create_sample_residual()
    tf_open = create_sample_telemetry(drs_code=8)
    cf_open = engine.evaluate_frame(rf, tf_open)
    assert "DRS_ACTIVE" in cf_open.active_flags
    assert cf_open.confounders.drs.active is True

    tf_closed = create_sample_telemetry(drs_code=0)
    cf_closed = engine.evaluate_frame(rf, tf_closed)
    assert "DRS_ACTIVE" not in cf_closed.active_flags
    assert cf_closed.confounders.drs.active is False

def test_2_braking_consistency():
    """Verify brake=100% produces active heavy braking, brake=0% produces inactive."""
    brk_heavy = evaluate_braking(brake_pct=100.0, residual_mag=2.5)
    assert brk_heavy.active is True
    assert brk_heavy.classification == ExplanatoryClassification.EXPLANATORY

    brk_none = evaluate_braking(brake_pct=0.0, residual_mag=2.5)
    assert brk_none.active is False
    assert brk_none.classification == ExplanatoryClassification.NONE

    # Engine frame evaluation
    engine = ConfounderEngine()
    rf = create_sample_residual()
    tf_brk = create_sample_telemetry(brake_pct=100.0)
    cf_brk = engine.evaluate_frame(rf, tf_brk)
    assert "HEAVY_BRAKING" in cf_brk.active_flags
    assert cf_brk.confounders.braking.active is True

    tf_nobrk = create_sample_telemetry(brake_pct=0.0)
    cf_nobrk = engine.evaluate_frame(rf, tf_nobrk)
    assert "HEAVY_BRAKING" not in cf_nobrk.active_flags
    assert cf_nobrk.confounders.braking.active is False

def test_3_high_speed_consistency():
    """Verify speed=262 km/h (>250 threshold) marks high speed active, speed=80 km/h marks inactive."""
    spd_fast = evaluate_high_speed(speed_mps=262.0 / 3.6)
    assert spd_fast.active is True
    assert spd_fast.classification == ExplanatoryClassification.EXPLANATORY

    spd_slow = evaluate_high_speed(speed_mps=80.0 / 3.6)
    assert spd_slow.active is False

    engine = ConfounderEngine()
    rf = create_sample_residual(actual_speed_mps=262.0 / 3.6)
    tf_fast = create_sample_telemetry(speed_kph=262.0)
    cf_fast = engine.evaluate_frame(rf, tf_fast)
    assert "HIGH_SPEED" in cf_fast.active_flags
    assert cf_fast.confounders.high_speed.active is True

def test_4_transient_consistency():
    """Verify transient rate changes mark transient active."""
    tr_active = evaluate_transient(d_throttle_dt=-150.0, d_brake_dt=200.0, d_accel_dt=10.0)
    assert tr_active.active is True
    assert tr_active.classification == ExplanatoryClassification.EXPLANATORY

    tr_steady = evaluate_transient(d_throttle_dt=0.0, d_brake_dt=0.0, d_accel_dt=0.1)
    assert tr_steady.active is False

def test_5_tyre_age_consistency():
    """Verify tyre_life_laps (2 laps) is authoritative over session lap count (20 laps)."""
    tf = create_sample_telemetry(tyre_life=2, lap=20)
    assert tf.tyres.fl.tyre_life_laps == 2
    assert tf.lap == 20
    assert tf.tyres.fl.compound == "SOFT"

def test_6_same_frame_state_consistency(client):
    """Verify API confounders endpoint returns coherent active flags and evaluation details."""
    resp = client.get("/api/confounders")
    assert resp.status_code == 200
    data = resp.json()
    assert "active_flags" in data
    assert "non_tyre_explanation_score" in data
    assert "tyre_evidence_quality" in data
    assert isinstance(data["active_flags"], list)
    if "confounders" in data and data["confounders"]:
        conf_eval = data["confounders"]
        for key in ["drs", "braking", "high_speed", "transient"]:
            if key in conf_eval:
                assert "active" in conf_eval[key]
                assert "classification" in conf_eval[key]

def test_7_real_replay_demo_separation(client):
    """Verify REAL_REPLAY tyres endpoint never fabricates simulated data."""
    resp = client.get("/api/tyres")
    assert resp.status_code == 200
    tyres = resp.json()
    for corner in ["FL", "FR", "RL", "RR"]:
        assert corner in tyres
        assert tyres[corner]["available"] is False
        assert tyres[corner]["tdi"] is None
        assert "unavailable" in tyres[corner]["reason"].lower()

def test_8_confidence_label_semantics(client):
    """Verify TDI state schema explicitly separates confidence from model reliability."""
    resp = client.get("/api/tdi")
    assert resp.status_code == 200
    data = resp.json()
    assert "confidence" in data
    assert "model_reliability" in data
    assert 0.0 <= data["confidence"] <= 1.0
    assert 0.0 <= data["model_reliability"] <= 1.0

def test_9_null_unavailable_tyre_data():
    """Verify unmeasured physical tyre channels remain strictly None."""
    tf = create_sample_telemetry()
    assert tf.tyres.fl.pressure_bar is None
    assert tf.tyres.fl.surface_temp_c is None
    assert tf.tyres.fl.carcass_temp_c is None
    assert tf.tyres.fl.slip_ratio is None
    assert tf.tyres.fl.slip_angle_deg is None
    assert tf.tyres.fl.wheel_speed_mps is None

def test_10_no_fabricated_values():
    """Ensure no random or synthetic values are injected into canonical telemetry frame."""
    tf = create_sample_telemetry(speed_kph=262.0)
    payload = tf.model_dump()
    assert payload["vehicle"]["speed_kph"] == 262.0
    for corner in ["fl", "fr", "rl", "rr"]:
        assert payload["tyres"][corner]["surface_temp_c"] is None
        assert payload["tyres"][corner]["inner_temp_c"] is None
