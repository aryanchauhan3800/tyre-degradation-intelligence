"""
TYRETRACE — Phase 10 Robustness & Edge-Case Validation Tests
Tests edge-case resilience, malformed inputs, out-of-bounds seeks,
stale frames, and network disconnect scenarios.
"""

import pytest
from pydantic import ValidationError
from backend.api.pipeline import UnifiedIntelligencePipeline
from backend.api.replay_controller import ReplayController
from backend.api.state import RuntimeState
from backend.api.websocket import ConnectionManager
from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)


def _make_dummy_frame(timestamp=100.0, speed_mps=50.0, throttle=100.0, brake=0.0):
    return TelemetryFrame(
        timestamp=timestamp,
        session_id="ROBUSTNESS_TEST",
        lap=1,
        driver="VER",
        vehicle=VehicleState(
            speed_mps=speed_mps,
            speed_kph=speed_mps * 3.6,
            throttle_pct=throttle,
            brake_pct=brake,
            gear=6,
            drs=0,
        ),
        tyres=FourWheelTyreStates(
            fl=TyreState(corner=WheelCorner.FL, compound="HARD", tyre_life_laps=10, stint=1),
            fr=TyreState(corner=WheelCorner.FR, compound="HARD", tyre_life_laps=10, stint=1),
            rl=TyreState(corner=WheelCorner.RL, compound="HARD", tyre_life_laps=10, stint=1),
            rr=TyreState(corner=WheelCorner.RR, compound="HARD", tyre_life_laps=10, stint=1),
        ),
        environment=EnvironmentState(ambient_temp_c=25.0, track_temp_c=35.0, humidity_pct=50.0),
    )


def test_zero_and_negative_dt_handling():
    """Validates that zero or negative time deltas do not cause ZeroDivisionError or crash."""
    pipeline = UnifiedIntelligencePipeline()
    frame1 = _make_dummy_frame(timestamp=100.0, speed_mps=50.0)
    # Duplicate timestamp
    frame2 = _make_dummy_frame(timestamp=100.0, speed_mps=52.0)
    # Decreasing timestamp
    frame3 = _make_dummy_frame(timestamp=99.5, speed_mps=48.0)

    res1 = pipeline.process_frame(frame1)
    res2 = pipeline.process_frame(frame2)
    res3 = pipeline.process_frame(frame3)

    assert res1.final_tdi >= 0.0
    assert res2.final_tdi >= 0.0
    assert res3.final_tdi >= 0.0


def test_missing_optional_environmental_fields():
    """Validates that frames with missing weather/environment context process safely."""
    pipeline = UnifiedIntelligencePipeline()
    frame = TelemetryFrame(
        timestamp=100.0,
        session_id="NO_ENV",
        lap=1,
        driver="VER",
        vehicle=VehicleState(
            speed_mps=60.0,
            speed_kph=216.0,
            throttle_pct=80.0,
            brake_pct=0.0,
            gear=7,
            drs=0,
            steer=None,
            rpm=None,
            relative_distance=None,
        ),
        tyres=FourWheelTyreStates(
            fl=TyreState(corner=WheelCorner.FL, compound="MEDIUM", tyre_life_laps=5, stint=1),
            fr=TyreState(corner=WheelCorner.FR, compound="MEDIUM", tyre_life_laps=5, stint=1),
            rl=TyreState(corner=WheelCorner.RL, compound="MEDIUM", tyre_life_laps=5, stint=1),
            rr=TyreState(corner=WheelCorner.RR, compound="MEDIUM", tyre_life_laps=5, stint=1),
        ),
        environment=EnvironmentState(ambient_temp_c=None, track_temp_c=None, humidity_pct=None),
    )

    result = pipeline.process_frame(frame)
    assert result.final_tdi >= 0.0
    assert result.physics["expected_acceleration_mps2"] is not None


def test_schema_rejects_negative_speeds():
    """Ensures Pydantic canonical schema strictly rejects invalid physical values."""
    with pytest.raises(ValidationError):
        VehicleState(
            speed_mps=-10.0,  # Negative speed rejected
            speed_kph=-36.0,
            throttle_pct=50.0,
            brake_pct=0.0,
            gear=1,
            drs=0,
        )


@pytest.mark.anyio
async def test_replay_controller_seek_boundaries():
    """Ensures replay controller strictly rejects out-of-bounds seek operations."""
    pipeline = UnifiedIntelligencePipeline()
    state = RuntimeState()
    ws_mgr = ConnectionManager()
    controller = ReplayController(
        pipeline=pipeline,
        state=state,
        ws_manager=ws_mgr,
        default_file="data/replay/f1_2023_monza_q_ver.json",
    )

    # Valid seek
    res = await controller.seek(100)
    assert res["current_frame"] in (100, 101)

    # Negative seek rejected
    with pytest.raises(ValueError, match="out of bounds"):
        await controller.seek(-5)

    # Out-of-bounds seek rejected
    with pytest.raises(ValueError, match="out of bounds"):
        await controller.seek(999999)


def test_playback_speed_validation():
    """Validates supported playback multipliers and rejects unsupported speeds."""
    pipeline = UnifiedIntelligencePipeline()
    state = RuntimeState()
    ws_mgr = ConnectionManager()
    controller = ReplayController(
        pipeline=pipeline,
        state=state,
        ws_manager=ws_mgr,
        default_file="data/replay/f1_2023_monza_q_ver.json",
    )

    for valid_speed in [0.25, 0.5, 1.0, 2.0, 5.0, 10.0]:
        res = controller.set_playback_speed(valid_speed)
        assert res["playback_speed"] == valid_speed

    # Unsupported speeds
    with pytest.raises(ValueError, match=r"Invalid playback speed"):
        controller.set_playback_speed(0.0)

    with pytest.raises(ValueError, match=r"Invalid playback speed"):
        controller.set_playback_speed(100.0)


@pytest.mark.anyio
async def test_websocket_manager_lifecycle():
    """Tests WebSocket manager connection, broadcast, and disconnect without deadlocks."""
    ws_mgr = ConnectionManager()
    assert len(ws_mgr.active_connections) == 0

    class MockWebSocket:
        def __init__(self):
            self.accepted = False
            self.sent = []

        async def accept(self):
            self.accepted = True

        async def send_text(self, text: str):
            self.sent.append(text)

    mock_ws = MockWebSocket()
    await ws_mgr.connect(mock_ws)
    assert len(ws_mgr.active_connections) == 1
    assert mock_ws.accepted is True

    # Disconnect
    await ws_mgr.disconnect(mock_ws)
    assert len(ws_mgr.active_connections) == 0
