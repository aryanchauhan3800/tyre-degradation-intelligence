import pytest
from pydantic import ValidationError

from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)


def create_valid_tyre(corner: WheelCorner) -> TyreState:
    return TyreState(
        corner=corner,
        pressure_bar=2.0,
        surface_temp_c=80.0,
        carcass_temp_c=78.0,
        wheel_speed_mps=30.0,
        slip_ratio=0.01,
        slip_angle_deg=1.5,
        vertical_load_n=4000.0,
    )


def create_valid_frame() -> TelemetryFrame:
    return TelemetryFrame(
        timestamp=1.0,
        session_id="TEST_001",
        lap=1,
        vehicle=VehicleState(
            speed_mps=30.0,
            speed_kph=108.0,
            steer_angle_deg=5.0,
            throttle_pct=70.0,
            brake_pct=0.0,
            longitudinal_accel_g=0.5,
            lateral_accel_g=0.8,
            yaw_rate_deg_s=4.0,
            gear=3,
        ),
        tyres=FourWheelTyreStates(
            fl=create_valid_tyre(WheelCorner.FL),
            fr=create_valid_tyre(WheelCorner.FR),
            rl=create_valid_tyre(WheelCorner.RL),
            rr=create_valid_tyre(WheelCorner.RR),
        ),
        environment=EnvironmentState(
            ambient_temp_c=22.0,
            track_temp_c=35.0,
            track_condition="dry",
            track_friction_mu=1.0,
        ),
    )


def test_valid_telemetry_frame():
    frame = create_valid_frame()
    assert frame.session_id == "TEST_001"
    assert frame.lap == 1
    assert frame.vehicle.speed_kph == 108.0
    assert frame.tyres.fl.corner == WheelCorner.FL
    assert frame.tyres.get_corner("FL").surface_temp_c == 80.0
    assert frame.timestamp_iso is not None


def test_invalid_pressure_rejected():
    with pytest.raises(ValidationError):
        # Pressure below minimum 0.5 bar
        TyreState(
            corner=WheelCorner.FL,
            pressure_bar=0.1,
            surface_temp_c=80.0,
            carcass_temp_c=78.0,
            wheel_speed_mps=30.0,
            slip_ratio=0.01,
        )

    with pytest.raises(ValidationError):
        # Pressure above maximum 5.0 bar
        TyreState(
            corner=WheelCorner.FL,
            pressure_bar=6.5,
            surface_temp_c=80.0,
            carcass_temp_c=78.0,
            wheel_speed_mps=30.0,
            slip_ratio=0.01,
        )


def test_invalid_temperature_rejected():
    with pytest.raises(ValidationError):
        # Temperature exceeding physical maximum 250°C
        TyreState(
            corner=WheelCorner.FR,
            pressure_bar=2.0,
            surface_temp_c=310.0,
            carcass_temp_c=78.0,
            wheel_speed_mps=30.0,
            slip_ratio=0.01,
        )


def test_mismatched_corner_in_four_wheel_states():
    with pytest.raises(ValidationError) as exc_info:
        # Putting an RR tyre in the FL slot
        FourWheelTyreStates(
            fl=create_valid_tyre(WheelCorner.RR),
            fr=create_valid_tyre(WheelCorner.FR),
            rl=create_valid_tyre(WheelCorner.RL),
            rr=create_valid_tyre(WheelCorner.RR),
        )
    assert "fl slot must have corner=FL" in str(exc_info.value)


def test_speed_kph_mps_inconsistency():
    with pytest.raises(ValidationError) as exc_info:
        VehicleState(
            speed_mps=20.0,     # expected ~72 km/h
            speed_kph=150.0,    # wildly inconsistent
            throttle_pct=50.0,
            brake_pct=0.0,
        )
    assert "inconsistent with speed_mps" in str(exc_info.value)
