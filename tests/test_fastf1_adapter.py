from datetime import timedelta
import pandas as pd
import pytest

from backend.replay.engine import ReplayEngine
from backend.schemas.telemetry import WheelCorner
from backend.telemetry.fastf1_adapter import FastF1Adapter, FastF1SessionConfig


def create_mock_telemetry_df() -> pd.DataFrame:
    return pd.DataFrame({
        "Date": [pd.Timestamp("2023-09-02 14:00:00"), pd.Timestamp("2023-09-02 14:00:00.200")],
        "SessionTime": [timedelta(seconds=3600.0), timedelta(seconds=3600.2)],
        "Time": [timedelta(seconds=0.0), timedelta(seconds=0.2)],
        "Speed": [280.5, 285.0],
        "RPM": [11200.0, 11450.0],
        "nGear": [7, 7],
        "Throttle": [100.0, 100.0],
        "Brake": [False, False],
        "DRS": [8, 8],
        "Distance": [10.5, 26.3],
        "RelativeDistance": [0.002, 0.005],
        "X": [150.2, 175.4],
        "Y": [-320.1, -310.5],
        "Z": [15.2, 15.3],
    })


def create_mock_lap_series() -> pd.Series:
    return pd.Series({
        "LapNumber": 12,
        "Driver": "VER",
        "Compound": "SOFT",
        "TyreLife": 4,
        "Stint": 2,
    })


def create_mock_weather_df() -> pd.DataFrame:
    return pd.DataFrame({
        "Time": [timedelta(seconds=3590.0), timedelta(seconds=3610.0)],
        "AirTemp": [27.4, 27.6],
        "TrackTemp": [42.1, 42.5],
        "Humidity": [45.0, 44.5],
        "Pressure": [1012.3, 1012.1],
        "WindSpeed": [2.8, 3.1],
        "WindDirection": [180, 190],
        "Rainfall": [False, False],
    })


def test_fastf1_adapter_offline_conversion():
    adapter = FastF1Adapter()
    tel_df = create_mock_telemetry_df()
    lap_series = create_mock_lap_series()
    weather_df = create_mock_weather_df()

    frames = adapter.convert_lap_telemetry(
        telemetry_df=tel_df,
        lap_series=lap_series,
        weather_df=weather_df,
        session_id="TEST_F1_MOCK",
    )

    assert len(frames) == 2
    f0 = frames[0]

    # Session & lap
    assert f0.session_id == "TEST_F1_MOCK"
    assert f0.lap == 12
    assert f0.driver == "VER"
    assert f0.timestamp == 3600.0

    # Vehicle dynamics mapped correctly
    assert f0.vehicle.speed_kph == 280.5
    assert abs(f0.vehicle.speed_mps - (280.5 / 3.6)) < 0.05
    assert f0.vehicle.throttle_pct == 100.0
    assert f0.vehicle.brake_pct == 0.0
    assert f0.vehicle.gear == 7
    assert f0.vehicle.rpm == 11200.0
    assert f0.vehicle.drs == 8
    assert f0.vehicle.position_x == 150.2
    assert f0.vehicle.position_y == -320.1

    # Unmeasured signals are strictly None without fabrication
    assert f0.vehicle.steer_angle_deg is None
    assert f0.vehicle.longitudinal_accel_g is None
    assert f0.vehicle.lateral_accel_g is None
    assert f0.vehicle.yaw_rate_deg_s is None

    # Tyre metadata mapped from lap series
    for corner in [WheelCorner.FL, WheelCorner.FR, WheelCorner.RL, WheelCorner.RR]:
        tyre = f0.tyres.get_corner(corner)
        assert tyre.corner == corner
        assert tyre.compound == "SOFT"
        assert tyre.tyre_life_laps == 4
        assert tyre.stint == 2

        # Physical sensors strictly None (never fabricated)
        assert tyre.pressure_bar is None
        assert tyre.surface_temp_c is None
        assert tyre.carcass_temp_c is None
        assert tyre.inner_temp_c is None
        assert tyre.wheel_speed_mps is None
        assert tyre.slip_ratio is None
        assert tyre.slip_angle_deg is None
        assert tyre.vertical_load_n is None

    # Environment mapped from closest weather entry
    assert f0.environment.ambient_temp_c == 27.4
    assert f0.environment.track_temp_c == 42.1
    assert f0.environment.track_condition == "dry"
    assert f0.environment.track_friction_mu is None


def test_fastf1_adapter_saves_and_replays_cleanly(tmp_path):
    adapter = FastF1Adapter()
    tel_df = create_mock_telemetry_df()
    lap_series = create_mock_lap_series()
    weather_df = create_mock_weather_df()

    frames = adapter.convert_lap_telemetry(
        telemetry_df=tel_df,
        lap_series=lap_series,
        weather_df=weather_df,
        session_id="MOCK_SESSION",
    )

    out_file = tmp_path / "f1_test_replay.json"
    saved_path = adapter.save_replay_data(frames, out_file)
    assert saved_path.exists()

    # Verify that ReplayEngine loads this normalized FastF1 dataset
    replay_engine = ReplayEngine()
    loaded_count = replay_engine.load_file(saved_path)
    assert loaded_count == 2

    frame = replay_engine.step()
    assert frame is not None
    assert frame.driver == "VER"
    assert frame.vehicle.speed_kph == 280.5
    assert frame.tyres.fl.pressure_bar is None  # verified preserved as null
