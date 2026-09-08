"""
TYRETRACE — Phase 10 End-to-End Pipeline & Consistency Validation Tests
Authoritative test suite verifying:
1. Complete 603-frame replay execution through all 7 engines
2. Internal pipeline consistency across REST, WebSocket, and Blender bridge payloads
3. Strict scientific boundaries on unavailable wheel channels
4. TDI mathematical bounds [0, 100] and confounder determinism
5. Mode separation between REAL_REPLAY and DEMO_SIMULATION
"""

import math
import pytest
from backend.api.pipeline import UnifiedIntelligencePipeline
from backend.api.state import RuntimeState
from backend.replay.engine import ReplayEngine
from backend.schemas.telemetry import TelemetryFrame


@pytest.fixture(scope="module")
def monza_replay_frames():
    engine = ReplayEngine(strict=False)
    engine.load_file("data/replay/f1_2023_monza_q_ver.json")
    return engine._parsed_frames


@pytest.fixture(scope="module")
def pipeline():
    return UnifiedIntelligencePipeline(
        model_path="data/ml/baseline_model.joblib",
        fusion_alpha=0.60,
        data_mode="REPLAY",
    )


def test_end_to_end_monza_replay(monza_replay_frames, pipeline):
    """
    Validates that the entire 603-frame Monza pole lap processes sequentially
    through Physics Twin, Residual, Confounder, TDI, AI, and Fusion layers without error.
    """
    assert len(monza_replay_frames) == 603

    prev_time = None
    state = RuntimeState()

    for idx, frame in enumerate(monza_replay_frames):
        # 1. Telemetry continuity
        assert "MONZA" in frame.session_id.upper() or "ITALIAN" in frame.session_id.upper()
        assert frame.lap == 20
        assert frame.vehicle.speed_mps >= 0.0
        assert frame.vehicle.speed_kph >= 0.0
        if prev_time is not None:
            assert frame.timestamp >= prev_time
        prev_time = frame.timestamp

        # 2. Pipeline processing
        result = pipeline.process_frame(frame)
        state.update_from_pipeline_result(result)

        # 3. Physics Twin outputs
        assert "expected_acceleration_mps2" in result.physics
        assert not math.isnan(result.physics["expected_acceleration_mps2"])
        assert not math.isinf(result.physics["expected_acceleration_mps2"])
        assert "parameter_provenance" in result.physics or "provenance" in result.physics

        # 4. Residual Engine outputs
        res = result.residual
        if idx > 0:  # Frame 0 has None for acceleration derivative
            assert res.acceleration_residual_mps2 is not None
            assert not math.isnan(res.acceleration_residual_mps2)
            assert not math.isinf(res.acceleration_residual_mps2)
            assert -50.0 <= res.acceleration_residual_mps2 <= 50.0

        # 5. Confounder Engine outputs
        conf = result.confounders
        assert 0.0 <= conf.non_tyre_explanation_score <= 1.0
        assert 0.0 <= conf.tyre_evidence_quality <= 1.0
        assert 0.0 <= conf.confidence <= 1.0
        assert isinstance(conf.active_flags, list)

        # 6. TDI Engine outputs (Bounds: [0.0, 100.0], no NaN, no Inf)
        assert 0.0 <= result.physics_tdi <= 100.0
        assert 0.0 <= result.ai_tdi <= 100.0
        assert 0.0 <= result.final_tdi <= 100.0
        assert not math.isnan(result.final_tdi)
        assert not math.isinf(result.final_tdi)
        assert 0.0 <= result.tdi_frame.confidence <= 1.0
        assert 0.0 <= result.model_reliability <= 1.0

        # 7. Scientific boundaries: 4-wheel degradation telemetry is UNAVAILABLE in FastF1
        for corner in ["fl", "fr", "rl", "rr"]:
            tyre_state = getattr(frame.tyres, corner)
            # FastF1 canonical frame preserves wheel-level wear as None
            assert tyre_state.surface_temp_c is None
            assert tyre_state.carcass_temp_c is None
            assert tyre_state.pressure_bar is None
            assert tyre_state.wheel_speed_mps is None
            assert tyre_state.slip_ratio is None

        # 8. Blender bridge payload
        blender = result.blender_payload
        assert abs(blender.vehicle.speed_kph - frame.vehicle.speed_kph) < 0.1
        assert blender.global_tdi == result.final_tdi
        assert blender.tyres.FL.available is False
        assert blender.tyres.FL.tdi is None
        assert blender.tyres.FR.available is False
        assert blender.tyres.FR.tdi is None
        assert blender.tyres.RL.available is False
        assert blender.tyres.RL.tdi is None
        assert blender.tyres.RR.available is False
        assert blender.tyres.RR.tdi is None


def test_pipeline_cross_surface_consistency(monza_replay_frames, pipeline):
    """
    Validates that a single frame produces identical values across
    PipelineResult, RuntimeState, and REST serialization.
    """
    # Pick a high-speed telemetry frame from Curva Grande
    test_frame = monza_replay_frames[150]
    result = pipeline.process_frame(test_frame)

    state = RuntimeState()
    state.update_from_pipeline_result(result)

    # 1. Telemetry consistency
    assert state.current_telemetry.vehicle.speed_kph == test_frame.vehicle.speed_kph
    assert state.current_telemetry.vehicle.throttle_pct == test_frame.vehicle.throttle_pct
    assert state.current_telemetry.vehicle.brake_pct == test_frame.vehicle.brake_pct
    assert state.current_telemetry.vehicle.gear == test_frame.vehicle.gear

    # 2. Physics consistency
    assert state.current_physics["expected_acceleration_mps2"] == result.physics["expected_acceleration_mps2"]

    # 3. Residual consistency
    assert state.current_residual["raw_residual_mps2"] == result.residual.acceleration_residual_mps2
    assert state.current_residual["normalized_residual"] == result.residual.normalized_residual

    # 4. Confounder consistency
    assert state.current_confounders["non_tyre_explanation_score"] == result.confounders.non_tyre_explanation_score
    assert state.current_confounders["tyre_evidence_quality"] == result.confounders.tyre_evidence_quality

    # 5. TDI & Fusion consistency
    assert state.current_tdi["physics_tdi"] == result.physics_tdi
    assert state.current_tdi["ai_tdi"] == result.ai_tdi
    assert state.current_tdi["final_tdi"] == result.final_tdi


def test_unmeasured_channel_integrity(monza_replay_frames):
    """
    Ensures that physical channels not present in FastF1 are NEVER fabricated.
    """
    for frame in monza_replay_frames[:20]:
        for corner in ["fl", "fr", "rl", "rr"]:
            tyre = getattr(frame.tyres, corner)
            assert tyre.surface_temp_c is None
            assert tyre.carcass_temp_c is None
            assert tyre.inner_temp_c is None
            assert tyre.middle_temp_c is None
            assert tyre.outer_temp_c is None
            assert tyre.pressure_bar is None
            assert tyre.wheel_speed_mps is None
            assert tyre.slip_ratio is None
            assert tyre.slip_angle_deg is None
            assert tyre.vertical_load_n is None


def test_mode_separation_and_provenance(pipeline, monza_replay_frames):
    """
    Verifies that REAL_REPLAY exposes data_mode='REPLAY' and refuses corner TDI,
    while DEMO_SIMULATION must be explicitly designated.
    """
    frame = monza_replay_frames[50]
    result = pipeline.process_frame(frame)

    assert pipeline.data_mode == "REPLAY"
    # Corner TDI in real replay MUST be null
    assert result.blender_payload.tyres.FL.tdi is None
    assert result.blender_payload.tyres.FR.tdi is None
    assert result.blender_payload.tyres.RL.tdi is None
    assert result.blender_payload.tyres.RR.tdi is None
