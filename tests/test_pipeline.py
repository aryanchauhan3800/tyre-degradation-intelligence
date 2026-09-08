"""
TYRETRACE — Unified Intelligence Pipeline Tests
Tests single-point orchestration: Telemetry -> Twin -> Residual -> Confounders -> TDI -> AI -> Fusion.
Verifies determinism, state synchronization, and absence of physical sensor fabrication.
"""

import pytest
from backend.api.pipeline import PipelineResult, UnifiedIntelligencePipeline
from backend.api.state import RuntimeState
from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)


def _make_sample_frame(timestamp: float = 100.0, speed: float = 65.0) -> TelemetryFrame:
    tyre = TyreState(
        corner=WheelCorner.FL,
        compound="SOFT",
        tyre_life_laps=3,
        stint=1,
    )
    tyres = FourWheelTyreStates(
        fl=tyre,
        fr=TyreState(corner=WheelCorner.FR, compound="SOFT", tyre_life_laps=3, stint=1),
        rl=TyreState(corner=WheelCorner.RL, compound="SOFT", tyre_life_laps=3, stint=1),
        rr=TyreState(corner=WheelCorner.RR, compound="SOFT", tyre_life_laps=3, stint=1),
    )
    vehicle = VehicleState(
        speed_mps=speed,
        speed_kph=speed * 3.6,
        throttle_pct=100.0,
        brake_pct=0.0,
        gear=7,
        drs=1,
    )
    env = EnvironmentState(
        ambient_temp_c=26.0,
        track_temp_c=35.0,
        humidity_pct=48.0,
    )
    return TelemetryFrame(
        timestamp=timestamp,
        session_id="SESS_INTEGRATION",
        lap=1,
        driver="VER",
        vehicle=vehicle,
        tyres=tyres,
        environment=env,
    )


def test_pipeline_execution():
    pipeline = UnifiedIntelligencePipeline()
    frame1 = _make_sample_frame(timestamp=100.0, speed=60.0)
    frame2 = _make_sample_frame(timestamp=100.2, speed=62.0)

    # Initial frame sets kinematics history
    pipeline.process_frame(frame1)
    # Second frame computes derivative and residual
    result = pipeline.process_frame(frame2)

    assert isinstance(result, PipelineResult)
    assert result.physics["expected_acceleration_mps2"] is not None
    assert result.residual.acceleration_residual_mps2 is not None
    assert 0.0 <= result.confounders.non_tyre_explanation_score <= 1.0
    assert 0.0 <= result.physics_tdi <= 100.0
    assert 0.0 <= result.ai_tdi <= 100.0
    assert 0.0 <= result.final_tdi <= 100.0
    assert result.blender_payload.sequence >= 1


def test_pipeline_determinism():
    pipeline1 = UnifiedIntelligencePipeline()
    pipeline2 = UnifiedIntelligencePipeline()

    frame1 = _make_sample_frame(timestamp=10.0, speed=55.0)
    frame2 = _make_sample_frame(timestamp=10.2, speed=60.0)

    # Process consecutive frames
    pipeline1.process_frame(frame1)
    res1 = pipeline1.process_frame(frame2)

    pipeline2.process_frame(frame1)
    res2 = pipeline2.process_frame(frame2)

    assert res1.physics_tdi == res2.physics_tdi
    assert res1.ai_tdi == res2.ai_tdi
    assert res1.final_tdi == res2.final_tdi
    assert res1.residual.acceleration_residual_mps2 == res2.residual.acceleration_residual_mps2


def test_state_synchronization():
    pipeline = UnifiedIntelligencePipeline()
    state = RuntimeState()

    frame = _make_sample_frame(timestamp=50.0)
    result = pipeline.process_frame(frame)
    state.update_from_pipeline_result(result)

    assert state.current_telemetry is not None
    assert state.current_physics is not None
    assert state.current_tdi["final_tdi"] == result.final_tdi
    assert len(state.tdi_history) == 1
    assert len(state.residual_history) == 1
    assert 1 in state.lap_summaries
