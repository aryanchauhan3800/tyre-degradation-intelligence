"""
TYRETRACE — ML Dataset Tests
Tests dataset schemas, missing telemetry handling, dataset builder mechanics, and sample sufficiency.
"""

import pytest
import pandas as pd
from backend.ml.dataset_builder import MLDatasetBuilder
from backend.ml.dataset_discovery import audit_session_suitability
from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)


def _create_mock_telemetry_frame(
    timestamp: float,
    lap: int = 1,
    speed_mps: float = 50.0,
    tyre_life: int = 5,
    stint: int = 1,
    compound: str = "MEDIUM",
) -> TelemetryFrame:
    tyre = TyreState(
        corner=WheelCorner.FL,
        compound=compound,
        tyre_life_laps=tyre_life,
        stint=stint,
    )
    tyres = FourWheelTyreStates(
        fl=tyre,
        fr=TyreState(corner=WheelCorner.FR, compound=compound, tyre_life_laps=tyre_life, stint=stint),
        rl=TyreState(corner=WheelCorner.RL, compound=compound, tyre_life_laps=tyre_life, stint=stint),
        rr=TyreState(corner=WheelCorner.RR, compound=compound, tyre_life_laps=tyre_life, stint=stint),
    )
    vehicle = VehicleState(
        speed_mps=speed_mps,
        speed_kph=speed_mps * 3.6,
        throttle_pct=80.0,
        brake_pct=0.0,
        gear=6,
    )
    env = EnvironmentState(
        ambient_temp_c=25.0,
        track_temp_c=32.0,
        humidity_pct=45.0,
    )
    return TelemetryFrame(
        timestamp=timestamp,
        session_id="TEST_RACE",
        lap=lap,
        driver="VER",
        vehicle=vehicle,
        tyres=tyres,
        environment=env,
    )


def test_dataset_schema():
    builder = MLDatasetBuilder(window_size=5, stride=2)
    frames = [_create_mock_telemetry_frame(timestamp=10.0 + i, tyre_life=i) for i in range(15)]
    vectors, df = builder.build_from_telemetry(frames, session_id="TEST_SCHEMA")

    assert len(vectors) > 0
    assert "window_id" in df.columns
    assert "target_tdi" in df.columns
    assert "group_id" in df.columns
    assert "mean_speed" in df.columns
    assert "residual_mean" in df.columns
    assert "non_tyre_explanation_score" in df.columns


def test_missing_data_handling():
    # In F1 telemetry, pressure, temps, and slip are None (unmeasured)
    builder = MLDatasetBuilder(window_size=5, stride=2)
    frames = [_create_mock_telemetry_frame(timestamp=10.0 + i) for i in range(10)]
    for f in frames:
        assert f.tyres.fl.pressure_bar is None
        assert f.tyres.fl.surface_temp_c is None
        assert f.tyres.fl.slip_ratio is None

    vectors, df = builder.build_from_telemetry(frames)
    # The builder executes without throwing errors or fabricating missing physical channels
    assert len(df) > 0
    assert not df["mean_speed"].isna().any()
    assert not df["target_tdi"].isna().any()


def test_insufficient_data_handling():
    builder = MLDatasetBuilder(window_size=20)
    frames = [_create_mock_telemetry_frame(timestamp=10.0 + i) for i in range(5)]
    # 5 frames is less than window_size=20
    with pytest.raises(ValueError, match="Insufficient telemetry frames"):
        builder.build_from_telemetry(frames)
