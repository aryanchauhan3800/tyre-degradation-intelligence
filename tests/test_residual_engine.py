import json
import math
import pytest

from backend.residual.features import (
    calculate_residual_quality_confidence,
    calculate_window_features,
    compute_linear_slope,
    compute_persistence_ratio,
)
from backend.residual.residual_engine import ResidualEngine
from backend.residual.schemas import (
    ResidualFrame,
    ResidualQualityStatus,
    ResidualTrend,
)
from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)
from backend.twin_engine.interface import TwinEngine


def create_frame(
    speed_mps: float = 30.0,
    timestamp: float = 1.0,
    lap: int = 1,
    throttle_pct: float = 50.0,
    brake_pct: float = 0.0,
) -> TelemetryFrame:
    def make_corner(c):
        return TyreState(corner=c, compound="SOFT", tyre_life_laps=3, stint=1)

    return TelemetryFrame(
        timestamp=timestamp,
        session_id="RESIDUAL_TEST",
        lap=lap,
        vehicle=VehicleState(
            speed_mps=speed_mps,
            speed_kph=speed_mps * 3.6,
            throttle_pct=throttle_pct,
            brake_pct=brake_pct,
            gear=3,
        ),
        tyres=FourWheelTyreStates(
            fl=make_corner(WheelCorner.FL),
            fr=make_corner(WheelCorner.FR),
            rl=make_corner(WheelCorner.RL),
            rr=make_corner(WheelCorner.RR),
        ),
        environment=EnvironmentState(
            ambient_temp_c=25.0,
            track_temp_c=35.0,
            track_condition="dry",
        ),
    )


# ========================================================
# 1. TEST EXACT RESIDUAL: actual = 10, expected = 8 -> r = 2
# ========================================================
def test_exact_residual_calculation():
    engine = ResidualEngine()
    # Frame 1 at t=1.0, v=0
    f1 = create_frame(speed_mps=0.0, timestamp=1.0)
    engine.process_frame(f1)

    # Frame 2 at t=2.0, v=10.0 -> ax_actual = (10 - 0) / 1.0 = 10.0 m/s^2
    f2 = create_frame(speed_mps=10.0, timestamp=2.0)

    # Mock or provide twin output with ax_expected = 8.0 m/s^2
    from backend.schemas.twin import TwinEngineOutput
    mock_twin_out = TwinEngineOutput(
        timestamp=2.0,
        session_id="RESIDUAL_TEST",
        lap=1,
        expected_acceleration_mps2=8.0,
        expected_drag_n=100.0,
        expected_rolling_resistance_n=100.0,
        expected_brake_force_n=0.0,
        expected_traction_force_n=6500.0,
        expected_vertical_load_n=7825.0,
        expected_fz_front_n=3500.0,
        expected_fz_rear_n=4325.0,
        expected_load_transfer_n=100.0,
        actual_speed_mps=10.0,
        model_confidence=0.90,
    )

    rf2 = engine.process_frame(f2, expected_twin_output=mock_twin_out)
    assert rf2.quality_status == ResidualQualityStatus.VALID
    assert rf2.actual_acceleration_mps2 == 10.0
    assert rf2.expected_acceleration_mps2 == 8.0
    assert math.isclose(rf2.acceleration_residual_mps2, 2.0, rel_tol=1e-5)


# ========================================================
# 2. TEST ZERO RESIDUAL: actual == expected -> r = 0
# ========================================================
def test_zero_residual():
    engine = ResidualEngine()
    f1 = create_frame(speed_mps=20.0, timestamp=1.0)
    engine.process_frame(f1)

    # v goes 20 -> 25 in 1s -> ax_actual = 5.0
    f2 = create_frame(speed_mps=25.0, timestamp=2.0)

    from backend.schemas.twin import TwinEngineOutput
    mock_twin_out = TwinEngineOutput(
        timestamp=2.0,
        session_id="RESIDUAL_TEST",
        lap=1,
        expected_acceleration_mps2=5.0,
        expected_drag_n=200.0,
        expected_rolling_resistance_n=100.0,
        expected_brake_force_n=0.0,
        expected_traction_force_n=4200.0,
        expected_vertical_load_n=7825.0,
        expected_fz_front_n=3500.0,
        expected_fz_rear_n=4325.0,
        expected_load_transfer_n=100.0,
        actual_speed_mps=25.0,
        model_confidence=0.90,
    )

    rf2 = engine.process_frame(f2, expected_twin_output=mock_twin_out)
    assert rf2.actual_acceleration_mps2 == 5.0
    assert rf2.expected_acceleration_mps2 == 5.0
    assert math.isclose(rf2.acceleration_residual_mps2, 0.0, abs_tol=1e-6)


# ========================================================
# 3. TEST NEGATIVE RESIDUAL: actual < expected
# ========================================================
def test_negative_residual():
    engine = ResidualEngine()
    f1 = create_frame(speed_mps=30.0, timestamp=1.0)
    engine.process_frame(f1)

    # v drops 30 -> 26 in 1s -> ax_actual = -4.0
    f2 = create_frame(speed_mps=26.0, timestamp=2.0)

    from backend.schemas.twin import TwinEngineOutput
    mock_twin_out = TwinEngineOutput(
        timestamp=2.0,
        session_id="RESIDUAL_TEST",
        lap=1,
        expected_acceleration_mps2=-2.0,  # Expected decel was only -2.0, but vehicle lost speed faster (-4.0)
        expected_drag_n=300.0,
        expected_rolling_resistance_n=100.0,
        expected_brake_force_n=1200.0,
        expected_traction_force_n=0.0,
        expected_vertical_load_n=7825.0,
        expected_fz_front_n=3600.0,
        expected_fz_rear_n=4225.0,
        expected_load_transfer_n=100.0,
        actual_speed_mps=26.0,
        model_confidence=0.90,
    )

    rf2 = engine.process_frame(f2, expected_twin_output=mock_twin_out)
    # r = -4.0 - (-2.0) = -2.0
    assert rf2.acceleration_residual_mps2 < 0.0
    assert math.isclose(rf2.acceleration_residual_mps2, -2.0, rel_tol=1e-5)


# ========================================================
# 4. TEST ACCELERATION DERIVATION: v1=10, v2=20, dt=2 -> a=5 m/s^2
# ========================================================
def test_acceleration_derivation():
    engine = ResidualEngine()
    f1 = create_frame(speed_mps=10.0, timestamp=0.0)
    engine.process_frame(f1)

    f2 = create_frame(speed_mps=20.0, timestamp=2.0)
    rf2 = engine.process_frame(f2)

    assert rf2.quality_status == ResidualQualityStatus.VALID
    assert math.isclose(rf2.actual_acceleration_mps2, 5.0, rel_tol=1e-5)
    assert rf2.signal_origin == "DERIVED_FROM_FASTF1_SPEED"


# ========================================================
# 5. TEST INVALID DT: dt = 0 -> INVALID_DT
# ========================================================
def test_invalid_dt_handling():
    engine = ResidualEngine()
    f1 = create_frame(speed_mps=15.0, timestamp=10.0)
    engine.process_frame(f1)

    # Duplicate timestamp
    f2 = create_frame(speed_mps=16.0, timestamp=10.0)
    rf2 = engine.process_frame(f2)

    assert rf2.quality_status == ResidualQualityStatus.INVALID_DT
    assert rf2.actual_acceleration_mps2 is None
    assert rf2.acceleration_residual_mps2 is None
    assert "Non-positive or duplicate delta time" in rf2.quality_reason


# ========================================================
# 6. TEST MISSING SPEED: Must not fabricate acceleration
# ========================================================
def test_missing_speed_not_fabricated():
    engine = ResidualEngine()
    f1 = create_frame(speed_mps=20.0, timestamp=1.0)
    engine.process_frame(f1)

    # Missing speed frame
    f_bad = create_frame(speed_mps=0.0, timestamp=2.0)
    f_bad.vehicle.speed_mps = None

    rf_bad = engine.process_frame(f_bad)
    assert rf_bad.quality_status == ResidualQualityStatus.MISSING_INPUT
    assert rf_bad.actual_acceleration_mps2 is None
    assert rf_bad.acceleration_residual_mps2 is None


# ========================================================
# 7. TEST NORMALIZED RESIDUAL: verify formula
# ========================================================
def test_normalized_residual_formula():
    engine = ResidualEngine(epsilon=1.0)
    f1 = create_frame(speed_mps=0.0, timestamp=1.0)
    engine.process_frame(f1)

    # r = 3.0, expected = 4.0 -> norm = 3.0 / max(|4.0|, 1.0) = 0.75
    f2 = create_frame(speed_mps=7.0, timestamp=2.0)  # ax_actual = 7.0

    from backend.schemas.twin import TwinEngineOutput
    mock_twin_out = TwinEngineOutput(
        timestamp=2.0,
        session_id="RESIDUAL_TEST",
        lap=1,
        expected_acceleration_mps2=4.0,
        expected_drag_n=100.0,
        expected_rolling_resistance_n=100.0,
        expected_brake_force_n=0.0,
        expected_traction_force_n=3400.0,
        expected_vertical_load_n=7825.0,
        expected_fz_front_n=3500.0,
        expected_fz_rear_n=4325.0,
        expected_load_transfer_n=100.0,
        actual_speed_mps=7.0,
        model_confidence=0.90,
    )
    rf2 = engine.process_frame(f2, expected_twin_output=mock_twin_out)
    assert math.isclose(rf2.acceleration_residual_mps2, 3.0, rel_tol=1e-5)
    assert math.isclose(rf2.normalized_residual, 0.75, rel_tol=1e-5)

    # When expected is tiny, e.g. 0.2 -> denom should clamp to epsilon 1.0
    mock_twin_near_zero = TwinEngineOutput(
        timestamp=3.0,
        session_id="RESIDUAL_TEST",
        lap=1,
        expected_acceleration_mps2=0.2,
        expected_drag_n=100.0,
        expected_rolling_resistance_n=100.0,
        expected_brake_force_n=0.0,
        expected_traction_force_n=1000.0,
        expected_vertical_load_n=7825.0,
        expected_fz_front_n=3500.0,
        expected_fz_rear_n=4325.0,
        expected_load_transfer_n=10.0,
        actual_speed_mps=8.0,
        model_confidence=0.90,
    )
    f3 = create_frame(speed_mps=8.2, timestamp=3.0)  # ax_actual = 1.2
    rf3 = engine.process_frame(f3, expected_twin_output=mock_twin_near_zero)
    # residual = 1.2 - 0.2 = 1.0
    # norm = 1.0 / max(|0.2|, 1.0) = 1.0 / 1.0 = 1.0
    assert math.isclose(rf3.acceleration_residual_mps2, 1.0, rel_tol=1e-5)
    assert math.isclose(rf3.normalized_residual, 1.0, rel_tol=1e-5)


# ========================================================
# 8. TEST PERSISTENCE RATIO
# ========================================================
def test_persistence_ratio():
    residuals = [0.2, 0.5, 1.2, 1.8, 0.4, 2.1, 0.8, 1.5, 0.1, 0.3]
    # Total 10. Samples >= 1.0 threshold: 1.2, 1.8, 2.1, 1.5 -> exactly 4 samples
    ratio = compute_persistence_ratio(residuals, threshold=1.0)
    assert math.isclose(ratio, 0.40, rel_tol=1e-5)

    # Empty list
    assert compute_persistence_ratio([]) is None


# ========================================================
# 9. TEST RESIDUAL SLOPE
# ========================================================
def test_residual_slope_calculation():
    # Residual increasing linearly at 0.5 m/s^3: r = 0.5 * t + 1.0
    times = [0.0, 1.0, 2.0, 3.0, 4.0]
    residuals = [1.0, 1.5, 2.0, 2.5, 3.0]

    slope = compute_linear_slope(times, residuals)
    assert math.isclose(slope, 0.5, rel_tol=1e-5)

    # Flat residuals -> slope = 0.0
    flat_residuals = [2.0, 2.0, 2.0, 2.0]
    flat_slope = compute_linear_slope([0, 1, 2, 3], flat_residuals)
    assert math.isclose(flat_slope, 0.0, abs_tol=1e-6)


# ========================================================
# 10. TEST LAP AGGREGATION
# ========================================================
def test_lap_aggregation():
    engine = ResidualEngine()

    # Create 6 frames spanning Lap 1 and Lap 2
    frames = [
        create_frame(speed_mps=10.0, timestamp=1.0, lap=1),
        create_frame(speed_mps=12.0, timestamp=2.0, lap=1),
        create_frame(speed_mps=15.0, timestamp=3.0, lap=1),
        create_frame(speed_mps=18.0, timestamp=4.0, lap=2),
        create_frame(speed_mps=20.0, timestamp=5.0, lap=2),
        create_frame(speed_mps=23.0, timestamp=6.0, lap=2),
    ]

    res_frames, report = engine.process_session(frames)
    assert len(res_frames) == 6
    assert len(report.lap_summaries) == 2

    lap1 = report.lap_summaries[0]
    lap2 = report.lap_summaries[1]

    assert lap1.lap == 1
    assert lap1.sample_count == 3
    assert lap1.valid_sample_count == 2  # first frame is missing derivative

    assert lap2.lap == 2
    assert lap2.sample_count == 3
    assert lap2.valid_sample_count == 3

    assert report.total_samples == 6
    assert report.valid_samples == 5


# ========================================================
# 11. TEST DETERMINISM
# ========================================================
def test_residual_engine_determinism():
    engine_a = ResidualEngine()
    engine_b = ResidualEngine()

    frames = [
        create_frame(speed_mps=20.0, timestamp=1.0),
        create_frame(speed_mps=22.0, timestamp=1.2),
        create_frame(speed_mps=25.0, timestamp=1.4),
    ]

    res_a, rep_a = engine_a.process_session(frames)
    res_b, rep_b = engine_b.process_session(frames)

    assert rep_a.model_dump() == rep_b.model_dump()
    for fa, fb in zip(res_a, res_b):
        assert fa.model_dump() == fb.model_dump()


# ========================================================
# 12. TEST JSON SERIALIZATION
# ========================================================
def test_visualization_and_json_serialization():
    engine = ResidualEngine()
    frames = [
        create_frame(speed_mps=10.0, timestamp=1.0),
        create_frame(speed_mps=12.0, timestamp=1.2),
        create_frame(speed_mps=15.0, timestamp=1.4),
    ]

    res_frames, report = engine.process_session(frames)
    vis_data = engine.get_visualization_data(res_frames)

    # Must be valid JSON
    json_str_vis = json.dumps(vis_data)
    json_str_rep = json.dumps(report.model_dump())
    json_str_frames = json.dumps([f.model_dump() for f in res_frames])

    assert len(json_str_vis) > 50
    assert len(json_str_rep) > 50
    assert len(json_str_frames) > 100
    assert "time" in vis_data
    assert "actual_acceleration" in vis_data
    assert "expected_acceleration" in vis_data
    assert "residual" in vis_data
